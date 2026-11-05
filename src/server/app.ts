import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type Context } from 'hono'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { apiError, sameOriginOnly, sessionMiddleware, type AppEnv } from './context'
import type { AppDeps } from './deps'
import { authRoutes } from './routes/auth'
import { fastRoutes } from './routes/fasts'
import { meRoutes, settingsRoutes } from './routes/me'
import { pushRoutes } from './routes/push'

export type { AppDeps } from './deps'

export function createApp(deps: AppDeps) {
  const { db, config } = deps
  const app = new Hono<AppEnv>()

  if (config.devLogging) app.use(logger())
  app.use(secureHeaders())

  const api = new Hono<AppEnv>()
    .use(sameOriginOnly)
    .use(sessionMiddleware(db, config.secureCookies))
    .get('/health', (c) => {
      db.$client.prepare('select 1').get()
      return c.json({ ok: true })
    })
    .route('/auth', authRoutes(deps))
    .route('/me', meRoutes(deps))
    .route('/settings', settingsRoutes(deps))
    .route('/fasts', fastRoutes(deps))
    .route('/push', pushRoutes(deps))

  app.route('/api', api)
  app.all('/api/*', (c) => apiError(c, 404, 'not_found'))

  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: 'internal_error' }, 500)
  })

  // Estáticos de la SPA (en desarrollo los sirve Vite).
  const setCacheHeaders = (path: string, c: Context) => {
    // Los ficheros de /assets llevan hash en el nombre. El resto (index.html, sw.js,
    // manifest) se revalida siempre para que las actualizaciones lleguen.
    // `path` es la ruta en disco: en Windows llega con barras invertidas.
    const isHashedAsset = path.replaceAll('\\', '/').includes('/assets/')
    c.header('Cache-Control', isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache')
  }
  app.use('/*', serveStatic({ root: config.webDist, onFound: setCacheHeaders }))
  app.get('*', serveStatic({ root: config.webDist, path: 'index.html', onFound: setCacheHeaders }))

  return app
}
