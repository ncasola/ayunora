import { timingSafeEqual } from 'node:crypto'
import { serveStatic } from '@hono/node-server/serve-static'
import { eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import type { z } from 'zod'
import { pushSubscriptionSchema } from '../shared/push'
import type { Db } from './db'
import { pushSubscriptions } from './db/schema'
import type { Env } from './env'
import { sendToSubscriptions, type PushSender } from './push'

export type AppDeps = {
  db: Db
  push: PushSender
  env: Pick<Env, 'NODE_ENV' | 'VAPID_PUBLIC_KEY' | 'SETUP_TOKEN' | 'WEB_DIST'>
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

async function parseJson<T extends z.ZodType>(c: Context, schema: T) {
  const body: unknown = await c.req.json().catch(() => undefined)
  return schema.safeParse(body)
}

export function createApp({ db, push, env }: AppDeps) {
  const app = new Hono()

  if (env.NODE_ENV === 'development') app.use(logger())
  app.use(secureHeaders())

  // Protección temporal del M0 hasta que exista login (M1).
  const requireSetupToken = createMiddleware(async (c, next) => {
    const token = c.req.header('x-setup-token') ?? ''
    if (!safeEqual(token, env.SETUP_TOKEN)) return c.json({ error: 'unauthorized' }, 401)
    await next()
  })

  const api = new Hono()
    .get('/health', (c) => {
      db.$client.prepare('select 1').get()
      return c.json({ ok: true })
    })
    .get('/push/public-key', (c) => c.json({ publicKey: env.VAPID_PUBLIC_KEY }))
    .post('/push/subscriptions', requireSetupToken, async (c) => {
      const parsed = await parseJson(c, pushSubscriptionSchema)
      if (!parsed.success) return c.json({ error: 'invalid_subscription' }, 400)
      const { endpoint, keys } = parsed.data
      const userAgent = c.req.header('user-agent') ?? null
      db.insert(pushSubscriptions)
        .values({ endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { p256dh: keys.p256dh, auth: keys.auth, userAgent },
        })
        .run()
      return c.json({ ok: true }, 201)
    })
    .delete('/push/subscriptions', requireSetupToken, async (c) => {
      const parsed = await parseJson(c, pushSubscriptionSchema.pick({ endpoint: true }))
      if (!parsed.success) return c.json({ error: 'invalid_endpoint' }, 400)
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint)).run()
      return c.json({ ok: true })
    })
    .post('/push/test', requireSetupToken, async (c) => {
      const targets = db.select().from(pushSubscriptions).all()
      const result = await sendToSubscriptions(db, push, targets, {
        title: 'Ayunora',
        body: '¡Las notificaciones funcionan! 🎉',
        url: '/',
        tag: 'test',
      })
      return c.json(result)
    })

  app.route('/api', api)
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

  // Estáticos de la SPA (en desarrollo los sirve Vite).
  const setCacheHeaders = (path: string, c: Context) => {
    // Los ficheros de /assets llevan hash en el nombre. El resto (index.html, sw.js,
    // manifest) se revalida siempre para que las actualizaciones lleguen.
    // `path` es la ruta en disco: en Windows llega con barras invertidas.
    const isHashedAsset = path.replaceAll('\\', '/').includes('/assets/')
    c.header('Cache-Control', isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache')
  }
  app.use('/*', serveStatic({ root: env.WEB_DIST, onFound: setCacheHeaders }))
  app.get('*', serveStatic({ root: env.WEB_DIST, path: 'index.html', onFound: setCacheHeaders }))

  return app
}
