# Plan de implementación y roadmap

Referencia funcional: [SPEC.md](./SPEC.md).

## Principio de orden

**Lo primero que se valida es el mayor riesgo: que un push enviado desde el VPS llegue a un iPhone con la PWA instalada.** Si eso falla, cambia el diseño entero. Por eso el M0 despliega en producción un «hola mundo» con push antes de construir ninguna funcionalidad.

## Roadmap

| Hito   | Contenido                                           | Esfuerzo estimado* | Entregable                                               |
| ------ | --------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| **M0** | Esqueleto, despliegue y push de prueba en el iPhone | 2–3 sesiones       | URL HTTPS instalable; llega un push de prueba            |
| **M1** | Cuentas y temporizador con planes y fases           | 3–4 sesiones       | Se puede ayunar y ver el progreso                        |
| **M2** | Notificaciones programadas y ajustes                | 2–3 sesiones       | Avisos de fin, aviso previo, hitos y recordatorio diario |
| **M3** | Historial, edición y estadísticas                   | 2–3 sesiones       | Lista, edición, racha y gráfico semanal                  |
| **M4** | Peso                                                | 1–2 sesiones       | Registro y gráfico de peso                               |
| **M5** | Pulido, onboarding y backups; lanzamiento | 2 sesiones         | **MVP en uso real**                                      |
| v2     | Mejoras tras usarla 2–3 semanas                     | —                  | Ver la lista al final                                    |

\* Una sesión equivale a unas 2–3 h de trabajo con Claude Code.

---

## M0 — Esqueleto y validación de riesgos

**Código**

- [x] Inicializar el proyecto: `package.json`, TypeScript estricto, ESLint y Prettier, Vitest.
- [x] Estructura `src/web` (Vite + React), `src/server` (Hono) y `src/shared`.
- [x] Scripts:
  - `dev`: Vite con proxy de `/api` hacia Hono en modo watch con `tsx`.
  - `build`: `vite build` más el bundle del servidor con `tsup`.
  - `start`.
- [x] Drizzle + better-sqlite3 (WAL, `foreign_keys=ON`), `drizzle-kit generate` y migraciones aplicadas al arrancar.
- [x] `vite-plugin-pwa` en modo `injectManifest`: manifest, iconos provisionales y un SW con handler de `push` y de `notificationclick`.
- [x] Endpoints mínimos: `GET /api/health`, `GET /api/push/public-key`, `POST /api/push/subscriptions` y `POST /api/push/test` (en el M0 sin auth, protegido por un token temporal).
- [x] Página mínima con el botón «Activar notificaciones» y el botón «Probar».
- [x] Generar las claves VAPID (`npx web-push generate-vapid-keys`): solo las de desarrollo. Las de producción se generan en el VPS.

**VPS** (siguiendo las reglas de `infra-vps/CLAUDE.md`: por fases, con confirmación entre fases y todo documentado en su `RUNBOOK.md`)

- [ ] Zona `ayunora.es` en Cloudflare; crear los registros A del apex y de `www` con proxy activado cuando exista el vhost (trampa 2).
- [ ] Instalar Node 24 LTS (NodeSource) y comprobar que no afecta a WordOps.
- [ ] Usuario de sistema `ayunora` y rutas:
  - `/opt/ayunora` para el código.
  - `/var/lib/ayunora` para la BD.
  - `/etc/ayunora/env` para los secretos (VAPID, `INVITE_CODE`), con permisos `600`.
- [ ] Unidad systemd `ayunora.service` (escrita en `deploy/ayunora.service`; falta instalarla):
  - `Restart=always`, `MemoryMax=200M` y `NODE_ENV=production`.
  - Escucha solo en `127.0.0.1:3100`.
  - Endurecimiento: `ProtectSystem=strict` y `ReadWritePaths=/var/lib/ayunora`.
- [ ] Vhost de Nginx como reverse proxy hacia `127.0.0.1:3100`:
  - Mirar en `wo --help` si `wo site create … --proxy` existe en esta versión. Si no, crear el vhost a mano.
  - **Sin caché FastCGI** (ojo con la trampa 3 del VPS).
  - `Cache-Control: no-cache` para `sw.js`, `manifest.webmanifest` e `index.html`.
- [ ] Certificado: HTTP-01 con `-le subdomain --force` (trampas 4 y 5). Comprobar que Cloudflare está en Full (strict).
- [ ] Cloudflare: regla de _Cache Bypass_ para `/api/*` y para `sw.js`.
- [x] `scripts/deploy.sh`:
  1. Build en local.
  2. Subida por `tar` + `ssh` de `dist/`, `drizzle/` y `package*.json` a una release nueva.
  3. `npm ci --omit=dev` en el servidor.
  4. `systemctl restart ayunora`.
  5. Smoke test de `/api/health`.

**Criterio de cierre**

- Desde el iPhone: abrir la URL en Safari, _Añadir a pantalla de inicio_, abrir la app, activar las notificaciones y pulsar «Probar» → **llega la notificación con la app cerrada**.
- `free -h` en el VPS sin degradación apreciable; RSS del proceso por debajo de 120 MB.

## M1 — Cuentas y temporizador

- [ ] Esquema y migración: `users`, `sessions`, `settings` y `fasts` (con el índice único parcial del ayuno activo).
- [ ] Auth:
  - Registro con `INVITE_CODE`, login y logout.
  - Middleware de sesión (cookie de 1 año que se renueva con el uso; token hasheado en la BD).
  - Límite de intentos de login y comprobación de `Origin`.
- [ ] `src/shared/plans.ts` y `src/shared/phases.ts`, con sus tests.
- [ ] API de ayunos: `active`, `start`, `stop` y `PATCH` de la hora de inicio.
- [ ] UI:
  - Login y registro.
  - Layout con la tab bar y las _safe areas_.
  - Pantalla del temporizador: anillo SVG, fase actual y siguiente, «Empecé antes…», terminar con confirmación y resumen al terminar.
- [ ] El temporizador se calcula desde `started_at`, con un tick de 1 s y refresco en `visibilitychange`.
- [ ] Ajustes mínimos: plan por defecto y zona horaria.
- [ ] Quitar la protección temporal del M0: el push queda ya ligado al usuario.

**Cierre:** registrarse, empezar un ayuno de 16:8, cerrar la app y reabrirla horas después con el progreso correcto.

## M2 — Notificaciones programadas

- [ ] Tabla `notification_jobs`.
- [ ] `src/shared/schedule.ts`: función pura `buildJobsForFast(fast, settings, now)` que devuelve los jobs. Tests con objetivos de distintas duraciones, hitos que caen después del objetivo y aviso previo en el pasado.
- [ ] Integración transaccional: al empezar, editar, terminar o borrar un ayuno, se cancelan los jobs y se vuelven a crear.
- [ ] Bucle del planificador:
  - Corre cada 15 s.
  - Envía a todas las suscripciones del usuario y limpia las que responden 404 o 410.
  - Reintenta y registra los fallos.
  - Gestiona los jobs atrasados tras un reinicio (ver SPEC §6).
- [ ] Recordatorio diario: cálculo de la próxima ocurrencia en la zona horaria del usuario (con Luxon o `date-fns-tz`). Tests con el cambio de hora de marzo y de octubre. Se omite si hay un ayuno activo.
- [ ] Textos de las notificaciones en español. Al tocar una, se abre o enfoca la PWA en `/`.
- [ ] Ajustes de notificaciones: interruptores por tipo, minutos del aviso previo, hora del recordatorio, estado del push en el dispositivo y botón de prueba.

**Cierre:** un ayuno de prueba de 20 min con el aviso previo a 5 min hace llegar los dos pushes a su hora. Reiniciar el servicio a mitad no provoca duplicados ni pérdidas.

## M3 — Historial y estadísticas

- [ ] API: listado paginado, `PATCH` completo, `DELETE` y alta manual, con validación de que no se solapan ayunos.
- [ ] `src/shared/stats.ts`: racha actual y mejor racha (por día local de fin), medias de 7 y 30 días, porcentaje de objetivos cumplidos, totales y serie de los últimos 7 días. Tests con casos de zona horaria.
- [ ] `GET /stats/summary`.
- [ ] UI:
  - Tarjetas de estadísticas y gráfico semanal.
  - Lista del historial con scroll infinito.
  - Hoja de edición con selectores de fecha y hora nativos.
  - Borrado con confirmación.
- [ ] Decidir la librería de gráficos (Recharts o SVG propio).

## M4 — Peso

- [ ] Tabla `weights` (registro único por usuario y día) y API `GET`, `PUT` y `DELETE`.
- [ ] UI:
  - Entrada rápida de kg con teclado decimal.
  - Gráfico con rangos de 30 días, 90 días y todo.
  - Variaciones y peso objetivo.
- [ ] Opcional en el resumen de fin de ayuno: «¿Registrar peso de hoy?».

## M5 — Pulido y lanzamiento

- [ ] Onboarding: guía de instalación en Safari, plan, permiso de push y recordatorio.
- [ ] Nombre, icono definitivo e iconos de todos los tamaños, más `apple-touch-icon`. Splash opcional.
- [ ] Modo oscuro, estados vacíos, errores de red y aviso de «Sin conexión».
- [ ] Aviso legal breve: las fases son informativas y no son consejo médico.
- [ ] **Backups:**
  - Volcado con `sqlite3 /var/lib/ayunora/ayunora.db ".backup …"` (o la API de backup de better-sqlite3) en `/var/backups/ayunora/` antes del restic diario.
  - Añadir esa ruta a `backup.sh`.
  - Probar una restauración.
- [ ] Monitorización mínima: `/api/health` en un uptime checker (por ejemplo, el de Cloudflare o UptimeRobot) y logs en journald.
- [ ] Documentar el despliegue en el `RUNBOOK.md` de `infra-vps` y en el README de este repo.
- [ ] Una semana de uso real antes de cerrar el MVP.

---

## v2 — Ideas post-MVP (se priorizarán tras usar la app)

- Cola de acciones offline, para empezar o terminar sin red y sincronizar después.
- Registro de agua o de bebidas sin calorías durante el ayuno.
- Passkeys (Face ID) para el login.
- Diario y estado de ánimo por ayuno (cómo se ha sentido, hambre de 1 a 5).
- Ayunar en compañía: ver el ayuno de otra cuenta, con avisos cruzados del tipo «X ha terminado su ayuno».
- Programar el ayuno, que se inicie automáticamente a una hora.
- Exportar a CSV.
- Logros e insignias (10 ayunos, racha de 7 días…).
- Si algún día se necesita una app nativa (widgets, Live Activities, Apple Health), reutilizar el backend con Capacitor o Expo.

## Riesgos y mitigaciones

| Riesgo                                                       | Mitigación                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| El push en iOS no llega o se revoca.                         | Se valida en el M0. El SW siempre muestra una notificación. Hay botón de prueba y estado visible en Ajustes. |
| Poca RAM en el VPS.                                          | Un proceso único con `MemoryMax=200M` y sin Docker. Se vigila con `free -h` y `/proc/pressure/memory`.       |
| Se pierde la BD.                                             | WAL más un `.backup` diario a restic/R2 con prueba de restauración.                                          |
| Un error al tocar el Nginx de WordOps tira los demás sitios. | `nginx -t` antes de cada recarga, vhost aislado sin caché FastCGI y seguir las trampas documentadas del VPS. |
| Desfases por zonas horarias o cambios de hora.               | Timestamps en UTC, zona horaria por usuario y tests específicos de los cambios de hora.                      |
| La sesión se pierde en la PWA de iOS.                        | Cookie `httpOnly` de servidor (no le afecta el límite de 7 días de ITP) y de larga duración.                 |
