// Utilidades compartidas por los tests del servidor.
import { createApp } from './app'
import { openDb } from './db'
import type { PushPayload } from '../shared/push'
import type { PushSender, PushTarget, SendResult } from './push'

export const H = 60 * 60 * 1000
export const INVITE = 'invita-123'
export const T0 = Date.UTC(2026, 10, 5, 20, 0) // 5 nov 2026, 20:00 UTC

export function fakeSender(results: Record<string, SendResult> = {}) {
  const sent: PushTarget[] = []
  const payloads: PushPayload[] = []
  const sender: PushSender = {
    async send(target, payload) {
      sent.push(target)
      payloads.push(payload)
      return results[target.endpoint] ?? { ok: true }
    },
  }
  return { sender, sent, payloads }
}

export function setup(sender: PushSender = fakeSender().sender) {
  const db = openDb(':memory:', './drizzle')
  const clock = { now: T0 }
  const app = createApp({
    db,
    push: sender,
    config: {
      devLogging: false,
      secureCookies: false,
      vapidPublicKey: 'pub-key',
      inviteCode: INVITE,
      webDist: './dist/web',
    },
    now: () => clock.now,
  })

  /** Cliente mínimo que conserva la cookie de sesión, como haría el navegador. */
  function client() {
    let cookie = ''
    async function call(
      method: string,
      path: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ) {
      const res = await app.request(`http://ayunora.test/api${path}`, {
        method,
        headers: {
          host: 'ayunora.test',
          ...(body !== undefined && { 'content-type': 'application/json' }),
          ...(cookie && { cookie }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const setCookie = res.headers.get('set-cookie')
      if (setCookie) cookie = setCookie.split(';')[0]!.endsWith('=') ? '' : setCookie.split(';')[0]!
      return res
    }
    return {
      call,
      get: (p: string) => call('GET', p),
      post: (p: string, b?: unknown) => call('POST', p, b ?? {}),
      patch: (p: string, b: unknown) => call('PATCH', p, b),
      cookie: () => cookie,
    }
  }

  async function registered(email = 'ella@ejemplo.es') {
    const c = client()
    const res = await c.post('/auth/register', {
      email,
      password: 'contraseña-segura',
      name: 'Ella',
      inviteCode: INVITE,
      timezone: 'Atlantic/Canary',
    })
    if (res.status !== 201) throw new Error(`registro falló: ${res.status}`)
    return c
  }

  return { db, app, clock, client, registered }
}
