# Ayunora

PWA de ayuno intermitente, instalable en iPhone, con avisos por Web Push.

- Especificación: [docs/SPEC.md](docs/SPEC.md)
- Plan y roadmap: [docs/PLAN.md](docs/PLAN.md)
- Despliegue: [docs/DEPLOY.md](docs/DEPLOY.md)

## Stack

- **Frontend:** Vite, React, Tailwind y `vite-plugin-pwa` (con service worker propio en `src/web/sw.ts`).
- **API:** Hono sobre Node 24.
- **Datos:** Drizzle con better-sqlite3.
- **Push:** `web-push` (VAPID).

```
src/web      SPA y service worker
src/server   API Hono, base de datos y push
src/shared   Código común a cliente y servidor (tipos, esquemas zod)
drizzle      Migraciones SQL (generadas)
deploy       Unidad systemd
scripts      deploy.sh
```

## Desarrollo

```bash
npm install
cp .env.example .env      # rellena las claves VAPID (npm run vapid) y SETUP_TOKEN
npm run dev               # API en :3100 y Vite en :5173 (con proxy de /api)
```

| Script                            | Para qué                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                     | Desarrollo con recarga en caliente                          |
| `npm run build` y `npm start`     | Build de producción y arranque, en `http://127.0.0.1:3100`  |
| `npm test`                        | Tests (Vitest)                                              |
| `npm run typecheck`               | TypeScript, tanto de la app como del service worker         |
| `npm run lint` / `npm run format` | ESLint y Prettier                                           |
| `npm run db:generate`             | Genera una migración tras cambiar `src/server/db/schema.ts` |

Para probar el push en local, Chrome y Edge permiten Web Push sobre `localhost`. En iPhone, hace falta HTTPS y tener la app instalada en la pantalla de inicio.
