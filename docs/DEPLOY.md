# Despliegue en el VPS de IONOS

El servidor se gestiona desde un repo privado de infraestructura (`infra-vps`). Sus reglas aplican aquí:

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

## Puesta en marcha (una sola vez) — HECHA el 05/11/2026

El detalle está en el `RUNBOOK.md` de `infra-vps` («Nuevo sitio: ayunora.es»). En resumen:

### Fase A — Node y usuario ✅

- Node **24.22.2** desde el repositorio apt de NodeSource, con clave firmada en `/etc/apt/keyrings/nodesource.gpg`. `unattended-upgrades` no lo actualiza: los parches se aplican a mano.
- Usuario de sistema `ayunora` y `/opt/ayunora/releases`, con `nestor` como dueño.
- No hizo falta regla de sudoers: `nestor` ya tiene sudo sin contraseña.

### Fase B — Secretos y servicio ✅

- `/etc/ayunora/env` (root, `600`) con las claves VAPID de producción, `VAPID_SUBJECT`, `INVITE_CODE` y Turnstile (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` y `TURNSTILE_HOSTNAMES=ayunora.es`).
  - Leer el código: `ssh ionos "sudo grep INVITE_CODE /etc/ayunora/env"`.
  - Rotar el código: genera uno aleatorio en el servidor sin mostrarlo. Lo aplica el siguiente despliegue o un `systemctl restart ayunora`:
    ```bash
    ssh ionos 'N=$(head -c 12 /dev/urandom | base64 | tr "+/" "-_" | tr -d "="); export N; sudo --preserve-env=N sh -c "umask 077; awk \"/^INVITE_CODE=/{print \\\"INVITE_CODE=\\\" ENVIRON[\\\"N\\\"]; next} {print}\" /etc/ayunora/env > /etc/ayunora/env.nuevo && mv /etc/ayunora/env.nuevo /etc/ayunora/env"'
    ```
  - **Sin Turnstile configurado, el servidor no arranca en producción**: falla cerrado a propósito. El secreto se rota desde el panel de Cloudflare (Turnstile › widget › Rotate secret), sustituyendo después `TURNSTILE_SECRET`.
  - **Si se cambian las claves VAPID, todas las suscripciones dejan de valer.**
- `ayunora.service` habilitado. RSS medido: 82 MB.

### Fase C — Nginx y certificado ✅

- `wo site create ayunora.es --proxy=127.0.0.1:3100`. La plantilla no trae caché FastCGI ni las `location` de estáticos de WordOps, pero tampoco el reto ACME.
  - Se añadió a mano `/var/www/ayunora.es/conf/nginx/acme.conf`. **No borrarlo**, o las renovaciones fallarán en silencio.
- `wo site update ayunora.es -le subdomain --force`, sin `www` (no existe en la zona). El certificado lo renueva acme.sh.
- Para probar el vhost desde el servidor, usar la IP pública: en `127.0.0.1:80` responde `stub_status`.
- Cloudflare: no hace falta ninguna regla de caché. `/api` (JSON) no se cachea, y `sw.js` se revalida en el borde.
  - Opcional: Browser Cache TTL → «Respect Existing Headers», para que `sw.js` no llegue con `max-age=14400`.
- Pendiente: comprobar en el iPhone la instalación y el push con la app cerrada (cierre del M0).

### Fase D — Backups ✅

- `backup.sh` del VPS copia la SQLite en caliente (`sqlite3 … ".backup …"` y después `integrity_check`) junto con los volcados de MariaDB, y además `/etc/ayunora`. Todo va al restic diario cifrado en R2.
- Restauración probada el 05/11/2026. El procedimiento está en el runbook del repo de infraestructura.

## Operación

```bash
scripts/deploy.sh                                   # desplegar
ssh ionos 'sudo journalctl -u ayunora -f'           # logs
ssh ionos 'ln -sfn /opt/ayunora/releases/<anterior> /opt/ayunora/current && sudo systemctl restart ayunora'   # rollback
```

> Las migraciones se aplican solas al arrancar. Para volver atrás a una release con un esquema anterior, primero hay que restaurar la BD.
