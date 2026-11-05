import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { pushSubscriptionSchema } from '../../shared/push'
import { readJson, requireAuth, type AppEnv } from '../context'
import { pushSubscriptions } from '../db/schema'
import type { AppDeps } from '../deps'
import { sendToSubscriptions } from '../push'

export function pushRoutes({ db, push, config }: AppDeps) {
  return new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/public-key', (c) => c.json({ publicKey: config.vapidPublicKey }))

    .post('/subscriptions', async (c) => {
      const body = await readJson(c, pushSubscriptionSchema)
      if ('response' in body) return body.response
      const { endpoint, keys } = body.data
      const userId = c.get('user')!.id
      const userAgent = c.req.header('user-agent') ?? null
      // Si el dispositivo ya estaba suscrito con otra cuenta, pasa a esta.
      db.insert(pushSubscriptions)
        .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
        })
        .run()
      return c.json({ ok: true }, 201)
    })

    .delete('/subscriptions', async (c) => {
      const body = await readJson(c, pushSubscriptionSchema.pick({ endpoint: true }))
      if ('response' in body) return body.response
      db.delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, body.data.endpoint),
            eq(pushSubscriptions.userId, c.get('user')!.id),
          ),
        )
        .run()
      return c.json({ ok: true })
    })

    .post('/test', async (c) => {
      const targets = db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, c.get('user')!.id))
        .all()
      const result = await sendToSubscriptions(db, push, targets, {
        title: 'Ayunora',
        body: '¡Las notificaciones funcionan! 🎉',
        url: '/',
        tag: 'test',
      })
      return c.json(result)
    })
}
