# Despliegue en el VPS de IONOS

El servidor se gestiona desde `infra-vps (repo privado)`. Sus reglas aplican aquí:

- Se trabaja por fases y se pide confirmación entre una y otra.
- Antes de recargar Nginx, siempre `nginx -t`.
- Todo lo que se hace queda documentado en su `RUNBOOK.md`.

## Arquitectura

```
iPhone ──HTTPS──> Cloudflare (proxy, Full strict) ──HTTPS──> Nginx (WordOps) ──HTTP──> 127.0.0.1:3100 node (systemd: ayunora)
                                                                                         └─ /var/lib/ayunora/ayunora.db (SQLite WAL)
```

## Rutas en el servidor

| Ruta                                  | Contenido                               | Dueño     |
| ------------------------------------- | --------------------------------------- | --------- |
| `/opt/ayunora/releases/<timestamp>`   | Una carpeta por release                 | `nestor`  |
| `/opt/ayunora/current`                | Symlink a la release activa             | `nestor`  |
| `/var/lib/ayunora/ayunora.db`         | Base de datos; la crea `StateDirectory` | `ayunora` |
| `/etc/ayunora/env`                    | Secretos, con permisos `600`            | `root`    |
| `/etc/systemd/system/ayunora.service` | Copia de `deploy/ayunora.service`       | `root`    |

## Puesta en marcha (una sola vez) — PENDIENTE

### Fase A — Node y usuario

1. Instalar Node 24 LTS desde NodeSource y comprobar `node -v`.
   - Verificar que no choca con nada de WordOps.
2. Crear el usuario de sistema: `sudo useradd --system --no-create-home --shell /usr/sbin/nologin ayunora`.
3. Crear las carpetas de la app:
   - `sudo mkdir -p /opt/ayunora/releases`
   - `sudo chown -R nestor:nestor /opt/ayunora`
4. Dar a `nestor` sudo sin contraseña **solo** para reiniciar el servicio y ver sus logs. En `/etc/sudoers.d/ayunora`, validado con `visudo -c`:
   ```
   nestor ALL=(root) NOPASSWD: /usr/bin/systemctl restart ayunora, /usr/bin/journalctl -u ayunora *
   ```

### Fase B — Secretos y servicio

1. Crear `/etc/ayunora/env` con permisos `600` y dueño root. El fichero lleva `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=https://ayunora.es` y `SETUP_TOKEN`.
   - Claves VAPID **nuevas**, generadas para producción con `npx web-push generate-vapid-keys`.
   - Ojo: si se cambian las claves VAPID, todas las suscripciones dejan de valer.
2. Copiar `deploy/ayunora.service` a `/etc/systemd/system/` y ejecutar `sudo systemctl daemon-reload && sudo systemctl enable ayunora`.
3. Lanzar el primer despliegue con `scripts/deploy.sh`.
4. Comprobar:
   - `curl http://127.0.0.1:3100/api/health` responde.
   - `systemctl status ayunora`.
   - RSS por debajo de 120 MB.

### Fase C — Nginx, DNS y certificado

1. Crear el vhost `ayunora.es` como reverse proxy hacia `127.0.0.1:3100`.
   - Mirar en `wo site create --help` si existe `--proxy`. Si no, crear el vhost a mano.
   - **Sin caché FastCGI**: es compartida entre sitios (trampa 3).
   - Cabeceras que debe pasar al backend: `Host`, `X-Forwarded-For` y `X-Forwarded-Proto`.
2. En Cloudflare, crear el A de `@` hacia `<IP-del-VPS>` y el CNAME de `www` hacia `ayunora.es`, los dos con proxy activado. Se hace justo antes del certificado, para no caer en el vhost de otro sitio del VPS (trampa 2).
3. Emitir el certificado por HTTP-01 con `--force`, que es obligatorio con el proxy de Cloudflare (trampa 5). Si `www` da problemas, usar `-le subdomain` (trampa 4).
4. Redirigir `www` al dominio raíz con un 301, en Nginx o con una regla de Cloudflare.
5. Cloudflare, ajustes de la zona:
   - SSL en Full (strict) y _Always Use HTTPS_ activado.
   - Regla de caché: _Bypass_ para `/api/*`, `/sw.js`, `/index.html` y `/manifest.webmanifest`.
6. Verificar:
   - `https://ayunora.es/api/health` responde.
   - La instalación en el iPhone funciona.
   - **Llega el push de prueba con la app cerrada** (criterio de cierre del M0).

### Fase D — Backups (M5)

- Ejecutar `sqlite3 /var/lib/ayunora/ayunora.db ".backup /var/backups/ayunora/ayunora.db"` antes del restic diario, añadiéndolo a `backup.sh` del VPS.
- Hacer una prueba de restauración.

## Operación

```bash
scripts/deploy.sh                                   # desplegar
ssh ionos 'sudo journalctl -u ayunora -f'           # logs
ssh ionos 'ln -sfn /opt/ayunora/releases/<anterior> /opt/ayunora/current && sudo systemctl restart ayunora'   # rollback
```

> Las migraciones se aplican solas al arrancar. Para volver atrás a una release con un esquema anterior, primero hay que restaurar la BD.
