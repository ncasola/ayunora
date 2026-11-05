import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { openDb, type Db } from './db'
import { pushSubscriptions } from './db/schema'
import type { PushSender, PushTarget, SendResult } from './push'

const TOKEN = 'test-setup-token-1234'

function fakeSender(results: Record<string, SendResult>) {
  const sent: PushTarget[] = []
  const sender: PushSender = {
    async send(target) {
      sent.push(target)
      return results[target.endpoint] ?? { ok: true }
    },
  }
  return { sender, sent }
}

function subscription(endpoint: string) {
  return { endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }
}

describe('API M0', () => {
  let db: Db

  beforeEach(() => {
    db = openDb(':memory:', './drizzle')
  })

  function makeApp(sender: PushSender = fakeSender({}).sender) {
    return createApp({
      db,
      push: sender,
      env: {
        NODE_ENV: 'test',
        VAPID_PUBLIC_KEY: 'pub-key',
        SETUP_TOKEN: TOKEN,
        WEB_DIST: './dist/web',
      },
    })
  }

  const post = (path: string, body?: unknown, token = TOKEN) =>
    new Request(`http://localhost/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-setup-token': token },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  it('health responde ok', async () => {
    const res = await makeApp().request('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('expone la clave pública VAPID', async () => {
    const res = await makeApp().request('/api/push/public-key')
    expect(await res.json()).toEqual({ publicKey: 'pub-key' })
  })

  it('rutas /api desconocidas devuelven 404 JSON, no el index.html', async () => {
    const res = await makeApp().request('/api/no-existe')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('exige el token de configuración para suscribirse', async () => {
    const res = await makeApp().request(
      post('/push/subscriptions', subscription('https://push.example/a'), 'malo'),
    )
    expect(res.status).toBe(401)
  })

  it('rechaza suscripciones mal formadas', async () => {
    const res = await makeApp().request(post('/push/subscriptions', { endpoint: 'no-es-url' }))
    expect(res.status).toBe(400)
  })

  it('guarda la suscripción y no la duplica al repetir', async () => {
    const app = makeApp()
    await app.request(post('/push/subscriptions', subscription('https://push.example/a')))
    const res = await app.request(
      post('/push/subscriptions', subscription('https://push.example/a')),
    )
    expect(res.status).toBe(201)
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(1)
  })

  it('el push de prueba envía a todas y borra las suscripciones caducadas', async () => {
    const { sender, sent } = fakeSender({
      'https://push.example/gone': { ok: false, gone: true, status: 410, error: 'Gone' },
      'https://push.example/err': { ok: false, gone: false, status: 500, error: 'boom' },
    })
    const app = makeApp(sender)
    for (const e of ['ok', 'gone', 'err']) {
      await app.request(post('/push/subscriptions', subscription(`https://push.example/${e}`)))
    }

    const res = await app.request(post('/push/test'))
    expect(await res.json()).toEqual({ sent: 1, removed: 1, failed: 1 })
    expect(sent).toHaveLength(3)

    const remaining = db
      .select()
      .from(pushSubscriptions)
      .all()
      .map((s) => s.endpoint)
    expect(remaining.sort()).toEqual(['https://push.example/err', 'https://push.example/ok'])
    const ok = db
      .select()
      .from(pushSubscriptions)
      .all()
      .find((s) => s.endpoint.endsWith('/ok'))
    expect(ok?.lastSuccessAt).toBeInstanceOf(Date)
  })
})
