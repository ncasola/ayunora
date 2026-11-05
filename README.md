# Ayunora

PWA de ayuno intermitente, instalable en iPhone, con avisos por Web Push. En producción en **https://ayunora.es**.

- Especificación: [docs/SPEC.md](docs/SPEC.md)
- Plan y roadmap: [docs/PLAN.md](docs/PLAN.md)
- Despliegue y operación: [docs/DEPLOY.md](docs/DEPLOY.md)

## Qué hace

- **Ayuno:**
  - Temporizador con anillo de progreso y fases (digestión → autofagia).
  - Planes 16:8, 18:6, 20:4, OMAD y personalizado.
  - «Empecé antes…», editar el inicio y cambiar el objetivo con el ayuno en curso.
- **Avisos (push), aunque la app esté cerrada:**
  - Fin del ayuno y aviso previo (15, 30 o 60 min antes).
  - Hito al entrar en cada fase.
  - Recordatorio diario a la hora local.
- **Historial:**
  - Racha actual y mejor racha, medias, porcentaje de objetivos cumplidos y gráfico de 7 días.
  - Editar, añadir a mano y borrar ayunos.
- **Peso:** registro diario, gráfico de evolución (30 días, 90 días o todo), variaciones y peso objetivo.
- **Cuentas:** una por persona, con registro mediante código de invitación (`INVITE_CODE`).

## Stack

- **Frontend:** Vite, React, Tailwind y `vite-plugin-pwa`, con service worker propio en `src/web/sw.ts`.
- **API:** Hono sobre Node 24.
- **Datos:** Drizzle con better-sqlite3 (WAL).
- **Push:** `web-push` (VAPID), con un planificador en el mismo proceso que envía los avisos.

```
src/web      SPA y service worker
src/server   API Hono, base de datos, push y planificador
src/shared   Código común a cliente y servidor: esquemas zod, planes, fases, avisos,
             estadísticas, peso y zonas horarias (todo con tests)
drizzle      Migraciones SQL (generadas, se aplican al arrancar)
deploy       Unidad systemd
scripts      deploy.sh y check-sw.mjs
```

## Desarrollo

```bash
npm install
cp .env.example .env      # rellena las claves VAPID (npm run vapid) e INVITE_CODE
npm run dev               # API en :3100 y Vite en :5173 (con proxy de /api)
```

| Script                            | Para qué                                                            |
| --------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                     | Desarrollo con recarga en caliente                                  |
| `npm run build` y `npm start`     | Build de producción y arranque, en `http://127.0.0.1:3100`          |
| `npm test`                        | Tests (Vitest)                                                      |
| `npm run typecheck`               | TypeScript, tanto de la app como del service worker                 |
| `npm run lint` / `npm run format` | ESLint y Prettier                                                   |
| `npm run db:generate`             | Genera una migración tras cambiar `src/server/db/schema.ts`         |
| `bash scripts/deploy.sh`          | Comprobaciones, build y despliegue en el VPS (ver `docs/DEPLOY.md`) |

## Cosas que conviene saber

- **En iPhone, el push solo funciona con la app instalada** en la pantalla de inicio (iOS 16.4 o posterior). Las notificaciones no se programan en el móvil: las envía el servidor a su hora.
- **El temporizador se calcula siempre desde `startedAt`.** iOS congela la app en segundo plano.
- **`scripts/check-sw.mjs` comprueba en cada build que el precache del service worker no tenga entradas duplicadas.** Ya pasó una vez con el manifest: el service worker no se instalaba y el botón de activar notificaciones se quedaba colgado.
- **Las versiones nuevas llegan solas:** la app busca actualizaciones al volver a primer plano y cada hora, y se recarga cuando hay una.
- **Para probar el push en local**, Chrome y Edge permiten Web Push sobre `localhost`.
