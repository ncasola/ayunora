import { eq } from 'drizzle-orm'
import webpush, { WebPushError } from 'web-push'
import type { PushPayload } from '../shared/push'
import type { Db } from './db'
import { pushSubscriptions } from './db/schema'
import type { Env } from './env'

export type PushTarget = { endpoint: string; p256dh: string; auth: string }

export type SendResult = { ok: true } | { ok: false; gone: boolean; status?: number; error: string }

export interface PushSender {
  send(target: PushTarget, payload: PushPayload): Promise<SendResult>
}

export function createWebPushSender(
  env: Pick<Env, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'>,
): PushSender {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)

  return {
    async send(target, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: 'high' },
        )
        return { ok: true }
      } catch (err) {
        if (err instanceof WebPushError) {
          // 404/410: la suscripción ya no existe (app desinstalada, permiso revocado…).
          const gone = err.statusCode === 404 || err.statusCode === 410
          return { ok: false, gone, status: err.statusCode, error: err.body || err.message }
        }
        return { ok: false, gone: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}

export type BroadcastResult = { sent: number; removed: number; failed: number }

/** Envía a las suscripciones dadas y borra las que el servicio de push da por muertas. */
export async function sendToSubscriptions(
  db: Db,
  sender: PushSender,
  targets: Array<PushTarget & { id: number }>,
  payload: PushPayload,
): Promise<BroadcastResult> {
  const result: BroadcastResult = { sent: 0, removed: 0, failed: 0 }

  const outcomes = await Promise.all(
    targets.map(async (target) => ({ target, res: await sender.send(target, payload) })),
  )

  for (const { target, res } of outcomes) {
    if (res.ok) {
      result.sent++
      db.update(pushSubscriptions)
        .set({ lastSuccessAt: new Date() })
        .where(eq(pushSubscriptions.id, target.id))
        .run()
    } else if (res.gone) {
      result.removed++
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id)).run()
    } else {
      result.failed++
      console.warn(`[push] fallo enviando a #${target.id} (${res.status ?? '-'}): ${res.error}`)
    }
  }
  return result
}
