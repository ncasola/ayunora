import { describe, expect, it } from 'vitest'
import type { ActiveFastDto, FastDto, MeDto } from '../shared/api'
import { createApp } from './app'
import { openDb, type Db } from './db'
import { pushSubscriptions } from './db/schema'
import type { PushSender, PushTarget, SendResult } from './push'

const H = 60 * 60 * 1000
const INVITE = 'invita-123'
const T0 = Date.UTC(2026, 10, 5, 20, 0) // 5 nov 2026, 20:00 UTC

function fakeSender(results: Record<string, SendResult> = {}) {
  const sent: PushTarget[] = []
  const sender: PushSender = {
    async send(target) {
      sent.push(target)
      return results[target.endpoint] ?? { ok: true }
    },
  }
  return { sender, sent }
}

function setup(sender: PushSender = fakeSender().sender) {
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
    expect(res.status).toBe(201)
    return c
  }

  return { db, app, clock, client, registered }
}

describe('salud y estáticos', () => {
  it('health responde sin sesión', async () => {
    const { client } = setup()
    const res = await client().get('/health')
    expect(res.status).toBe(200)
  })

  it('rutas /api desconocidas devuelven 404 JSON', async () => {
    const { client } = setup()
    const res = await client().get('/no-existe')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })
})

describe('autenticación', () => {
  it('registro: crea cuenta, inicia sesión y devuelve ajustes por defecto', async () => {
    const { registered } = setup()
    const c = await registered()
    expect(c.cookie()).toMatch(/^ayunora_session=/)
    const me = (await (await c.get('/me')).json()) as MeDto
    expect(me.user).toMatchObject({
      email: 'ella@ejemplo.es',
      name: 'Ella',
      timezone: 'Atlantic/Canary',
    })
    expect(me.settings).toEqual({ defaultPlan: '16:8', customGoalMinutes: 960 })
  })

  it('registro: exige el código de invitación correcto', async () => {
    const { client } = setup()
    const res = await client().post('/auth/register', {
      email: 'x@x.es',
      password: '12345678',
      name: 'X',
      inviteCode: 'malo',
      timezone: 'Europe/Madrid',
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'invalid_invite' })
  })

  it('registro: no permite emails repetidos (sin distinguir mayúsculas)', async () => {
    const { registered, client } = setup()
    await registered('ella@ejemplo.es')
    const res = await client().post('/auth/register', {
      email: 'ELLA@ejemplo.es',
      password: '12345678',
      name: 'Otra',
      inviteCode: INVITE,
      timezone: 'Europe/Madrid',
    })
    expect(res.status).toBe(409)
  })

  it('login correcto, login incorrecto y logout', async () => {
    const { registered, client } = setup()
    await registered()

    const bad = await client().post('/auth/login', {
      email: 'ella@ejemplo.es',
      password: 'otra-cosa',
    })
    expect(bad.status).toBe(401)
    const unknown = await client().post('/auth/login', { email: 'nadie@ejemplo.es', password: 'x' })
    expect(unknown.status).toBe(401)

    const c = client()
    expect(
      (await c.post('/auth/login', { email: 'Ella@Ejemplo.es', password: 'contraseña-segura' }))
        .status,
    ).toBe(200)
    expect((await c.get('/me')).status).toBe(200)

    await c.post('/auth/logout')
    expect((await c.get('/me')).status).toBe(401)
  })

  it('limita los intentos de login por IP', async () => {
    const { client } = setup()
    const c = client()
    let last = 0
    for (let i = 0; i < 11; i++) {
      const res = await c.call(
        'POST',
        '/auth/login',
        { email: 'a@a.es', password: 'x' },
        { 'x-real-ip': '1.2.3.4' },
      )
      last = res.status
    }
    expect(last).toBe(429)
  })

  it('rechaza peticiones que modifican datos desde otro origen', async () => {
    const { registered } = setup()
    const c = await registered()
    const res = await c.call(
      'POST',
      '/fasts',
      { plan: '16:8', goalMinutes: 960 },
      { origin: 'https://malo.example' },
    )
    expect(res.status).toBe(403)
    const ok = await c.call(
      'POST',
      '/fasts',
      { plan: '16:8', goalMinutes: 960 },
      { origin: 'https://ayunora.test' },
    )
    expect(ok.status).toBe(201)
  })

  it('sin sesión, las rutas privadas devuelven 401', async () => {
    const { client } = setup()
    for (const p of ['/me', '/settings', '/fasts/active', '/push/public-key']) {
      expect((await client().get(p)).status).toBe(401)
    }
  })
})

describe('perfil y ajustes', () => {
  it('actualiza nombre, zona horaria y plan por defecto', async () => {
    const { registered } = setup()
    const c = await registered()
    const me = (await (
      await c.patch('/me', { name: 'Ella M.', timezone: 'Europe/Madrid' })
    ).json()) as MeDto
    expect(me.user).toMatchObject({ name: 'Ella M.', timezone: 'Europe/Madrid' })

    const s = await (
      await c.patch('/settings', { defaultPlan: 'custom', customGoalMinutes: 14 * 60 + 30 })
    ).json()
    expect(s).toEqual({ defaultPlan: 'custom', customGoalMinutes: 870 })

    expect((await c.patch('/settings', { customGoalMinutes: 50 })).status).toBe(400)
    expect((await c.patch('/me', { timezone: 'Nada/Nada' })).status).toBe(400)
  })
})

describe('ayunos', () => {
  it('ciclo completo: empezar, ver activo, terminar', async () => {
    const { registered, clock } = setup()
    const c = await registered()

    let active = (await (await c.get('/fasts/active')).json()) as ActiveFastDto
    expect(active).toEqual({ active: null, lastEndedAt: null })

    const started = (await (
      await c.post('/fasts', { plan: '16:8', goalMinutes: 960 })
    ).json()) as FastDto
    expect(started).toMatchObject({ startedAt: T0, endedAt: null, goalMinutes: 960, plan: '16:8' })

    active = (await (await c.get('/fasts/active')).json()) as ActiveFastDto
    expect(active.active?.id).toBe(started.id)

    clock.now = T0 + 16 * H + 5 * 60 * 1000
    const stopped = (await (await c.post(`/fasts/${started.id}/stop`)).json()) as FastDto
    expect(stopped.endedAt).toBe(clock.now)

    active = (await (await c.get('/fasts/active')).json()) as ActiveFastDto
    expect(active).toEqual({ active: null, lastEndedAt: clock.now })
  })

  it('solo un ayuno activo a la vez', async () => {
    const { registered } = setup()
    const c = await registered()
    await c.post('/fasts', { plan: '16:8', goalMinutes: 960 })
    const res = await c.post('/fasts', { plan: '18:6', goalMinutes: 1080 })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'fast_already_active' })
  })

  it('«Empecé antes…»: permite retrasar el inicio, pero no al futuro ni más de 72 h', async () => {
    const { registered } = setup()
    const c = await registered()
    expect(
      (await c.post('/fasts', { plan: '16:8', goalMinutes: 960, startedAt: T0 + 10 * 60 * 1000 }))
        .status,
    ).toBe(400)
    expect(
      (await c.post('/fasts', { plan: '16:8', goalMinutes: 960, startedAt: T0 - 73 * H })).status,
    ).toBe(400)
    const res = await c.post('/fasts', { plan: '16:8', goalMinutes: 960, startedAt: T0 - 2 * H })
    expect(res.status).toBe(201)
    expect(((await res.json()) as FastDto).startedAt).toBe(T0 - 2 * H)
  })

  it('un ayuno nuevo no puede empezar antes de que acabe el anterior', async () => {
    const { registered, clock } = setup()
    const c = await registered()
    const f = (await (await c.post('/fasts', { plan: '16:8', goalMinutes: 960 })).json()) as FastDto
    clock.now = T0 + 16 * H
    await c.post(`/fasts/${f.id}/stop`)
    clock.now = T0 + 20 * H
    const res = await c.post('/fasts', { plan: '16:8', goalMinutes: 960, startedAt: T0 + 15 * H })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'overlaps_previous' })
  })

  it('editar la hora de inicio del ayuno activo', async () => {
    const { registered } = setup()
    const c = await registered()
    const f = (await (await c.post('/fasts', { plan: '16:8', goalMinutes: 960 })).json()) as FastDto
    const res = await c.patch(`/fasts/${f.id}`, {
      startedAt: T0 - 30 * 60 * 1000,
      plan: '18:6',
      goalMinutes: 1080,
    })
    expect(await res.json()).toMatchObject({
      startedAt: T0 - 30 * 60 * 1000,
      plan: '18:6',
      goalMinutes: 1080,
    })
    expect((await c.patch(`/fasts/${f.id}`, { startedAt: T0 + H })).status).toBe(400)
  })

  it('no se puede terminar antes de empezar ni terminar dos veces', async () => {
    const { registered, clock } = setup()
    const c = await registered()
    const f = (await (await c.post('/fasts', { plan: '16:8', goalMinutes: 960 })).json()) as FastDto
    expect((await c.post(`/fasts/${f.id}/stop`, { endedAt: T0 - 1000 })).status).toBe(400)
    clock.now = T0 + H
    expect((await c.post(`/fasts/${f.id}/stop`)).status).toBe(200)
    expect((await c.post(`/fasts/${f.id}/stop`)).status).toBe(409)
  })

  it('cada usuario solo ve y toca sus ayunos', async () => {
    const { registered } = setup()
    const ella = await registered('ella@ejemplo.es')
    const el = await registered('el@ejemplo.es')
    const f = (await (
      await ella.post('/fasts', { plan: '16:8', goalMinutes: 960 })
    ).json()) as FastDto
    expect((await el.post(`/fasts/${f.id}/stop`)).status).toBe(404)
    expect((await el.patch(`/fasts/${f.id}`, { note: 'hola' })).status).toBe(404)
    expect(((await (await el.get('/fasts/active')).json()) as ActiveFastDto).active).toBeNull()
    // Y él puede tener su propio ayuno activo a la vez.
    expect((await el.post('/fasts', { plan: '18:6', goalMinutes: 1080 })).status).toBe(201)
  })
})

describe('push', () => {
  const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } })

  it('suscribe dispositivos del usuario y el push de prueba solo va a los suyos', async () => {
    const { sender, sent } = fakeSender({
      'https://push.example/gone': { ok: false, gone: true, status: 410, error: 'Gone' },
    })
    const { registered, db } = setup(sender)
    const ella = await registered('ella@ejemplo.es')
    const el = await registered('el@ejemplo.es')

    await ella.post('/push/subscriptions', sub('https://push.example/ella'))
    await ella.post('/push/subscriptions', sub('https://push.example/gone'))
    await el.post('/push/subscriptions', sub('https://push.example/el'))

    const res = await ella.post('/push/test')
    expect(await res.json()).toEqual({ sent: 1, removed: 1, failed: 0 })
    expect(sent.map((s) => s.endpoint).sort()).toEqual([
      'https://push.example/ella',
      'https://push.example/gone',
    ])

    const endpoints = db
      .select()
      .from(pushSubscriptions)
      .all()
      .map((s) => s.endpoint)
      .sort()
    expect(endpoints).toEqual(['https://push.example/el', 'https://push.example/ella'])
  })

  it('un dispositivo suscrito con otra cuenta pasa a la cuenta actual', async () => {
    const { registered, db } = setup()
    const ella = await registered('ella@ejemplo.es')
    const el = await registered('el@ejemplo.es')
    await ella.post('/push/subscriptions', sub('https://push.example/movil'))
    await el.post('/push/subscriptions', sub('https://push.example/movil'))
    const rows = db.select().from(pushSubscriptions).all()
    expect(rows).toHaveLength(1)
  })

  it('rechaza suscripciones mal formadas', async () => {
    const { registered } = setup()
    const c = await registered()
    expect((await c.post('/push/subscriptions', { endpoint: 'no-es-url' })).status).toBe(400)
  })
})

// Evita avisos de variable sin usar en algunos editores.
export type { Db }
