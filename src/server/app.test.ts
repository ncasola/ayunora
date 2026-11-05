import { describe, expect, it } from 'vitest'
import type { ActiveFastDto, FastDto, FastPageDto, MeDto, StatsDto } from '../shared/api'
import type { WeightDto } from '../shared/weights'
import type { Db } from './db'
import { notificationJobs, pushSubscriptions } from './db/schema'
import { fakeSender, H, INVITE, setup, T0 } from './testing'
import type { TurnstileVerifier } from './turnstile'

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
    expect(me.settings).toMatchObject({
      defaultPlan: '16:8',
      customGoalMinutes: 960,
      reminderEnabled: false,
    })
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
    expect(s).toMatchObject({ defaultPlan: 'custom', customGoalMinutes: 870 })

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
    expect(await res.json()).toEqual({ error: 'fast_overlap' })
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
      'https://web.push.apple.com/gone': { ok: false, gone: true, status: 410, error: 'Gone' },
    })
    const { registered, db } = setup(sender)
    const ella = await registered('ella@ejemplo.es')
    const el = await registered('el@ejemplo.es')

    await ella.post('/push/subscriptions', sub('https://web.push.apple.com/ella'))
    await ella.post('/push/subscriptions', sub('https://web.push.apple.com/gone'))
    await el.post('/push/subscriptions', sub('https://web.push.apple.com/el'))

    const res = await ella.post('/push/test')
    expect(await res.json()).toEqual({ sent: 1, removed: 1, failed: 0 })
    expect(sent.map((s) => s.endpoint).sort()).toEqual([
      'https://web.push.apple.com/ella',
      'https://web.push.apple.com/gone',
    ])

    const endpoints = db
      .select()
      .from(pushSubscriptions)
      .all()
      .map((s) => s.endpoint)
      .sort()
    expect(endpoints).toEqual(['https://web.push.apple.com/el', 'https://web.push.apple.com/ella'])
  })

  it('un dispositivo suscrito con otra cuenta pasa a la cuenta actual', async () => {
    const { registered, db } = setup()
    const ella = await registered('ella@ejemplo.es')
    const el = await registered('el@ejemplo.es')
    await ella.post('/push/subscriptions', sub('https://web.push.apple.com/movil'))
    await el.post('/push/subscriptions', sub('https://web.push.apple.com/movil'))
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

describe('historial (M3)', () => {
  const MIN = 60 * 1000
  /** Crea un ayuno terminado a mano que acaba `endHoursAgo` antes de T0 y dura `hours`. */
  const manual = (endHoursAgo: number, hours: number, extra: object = {}) => ({
    startedAt: T0 - (endHoursAgo + hours) * H,
    endedAt: T0 - endHoursAgo * H,
    plan: '16:8',
    goalMinutes: 960,
    ...extra,
  })

  it('añadir a mano, listar con paginación y del más reciente al más antiguo', async () => {
    const { registered } = setup()
    const c = await registered()
    for (let i = 0; i < 5; i++) {
      expect((await c.post('/fasts/manual', manual(i * 24 + 2, 16))).status).toBe(201)
    }
    const page1 = (await (await c.get('/fasts?limit=2')).json()) as FastPageDto
    expect(page1.items).toHaveLength(2)
    expect(page1.items[0]!.startedAt).toBeGreaterThan(page1.items[1]!.startedAt)
    expect(page1.nextBefore).toBe(page1.items[1]!.startedAt)

    const page2 = (await (
      await c.get(`/fasts?limit=2&before=${page1.nextBefore}`)
    ).json()) as FastPageDto
    const page3 = (await (
      await c.get(`/fasts?limit=2&before=${page2.nextBefore}`)
    ).json()) as FastPageDto
    expect(page3.items).toHaveLength(1)
    expect(page3.nextBefore).toBeNull()
    const ids = [...page1.items, ...page2.items, ...page3.items].map((f) => f.id)
    expect(new Set(ids).size).toBe(5)
  })

  it('el historial no incluye el ayuno en curso', async () => {
    const { registered } = setup()
    const c = await registered()
    await c.post('/fasts/manual', manual(4, 16))
    await c.post('/fasts', { plan: '16:8', goalMinutes: 960 })
    const page = (await (await c.get('/fasts')).json()) as FastPageDto
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.endedAt).not.toBeNull()
  })

  it('no permite solapes al añadir ni al editar (tocarse sí)', async () => {
    const { registered } = setup()
    const c = await registered()
    const a = (await (await c.post('/fasts/manual', manual(30, 16))).json()) as FastDto
    // Se solapa por la cola.
    expect((await c.post('/fasts/manual', manual(20, 16))).status).toBe(409)
    // Empieza justo cuando acaba el otro: válido.
    const b = (await (
      await c.post('/fasts/manual', {
        startedAt: a.endedAt!,
        endedAt: a.endedAt! + 4 * H,
        plan: 'custom',
        goalMinutes: 240,
      })
    ).json()) as FastDto
    expect(b.id).toBeGreaterThan(a.id)
    // Alargar el primero hasta pisar el segundo.
    const res = await c.patch(`/fasts/${a.id}`, { endedAt: a.endedAt! + H })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'fast_overlap' })
  })

  it('valida rangos: fin anterior al inicio, futuro y más de 7 días', async () => {
    const { registered } = setup()
    const c = await registered()
    expect((await c.post('/fasts/manual', { ...manual(2, 16), endedAt: T0 - 30 * H })).status).toBe(
      400,
    )
    expect((await c.post('/fasts/manual', { ...manual(0, 16), endedAt: T0 + H })).status).toBe(400)
    const tooLong = await c.post('/fasts/manual', manual(1, 8 * 24))
    expect(await tooLong.json()).toEqual({ error: 'fast_too_long' })
  })

  it('editar inicio, fin, objetivo y nota de un ayuno terminado', async () => {
    const { registered } = setup()
    const c = await registered()
    const f = (await (await c.post('/fasts/manual', manual(5, 16))).json()) as FastDto
    const res = await c.patch(`/fasts/${f.id}`, {
      startedAt: f.startedAt - 30 * MIN,
      endedAt: f.endedAt! + 30 * MIN,
      plan: '18:6',
      goalMinutes: 1080,
      note: '  Me costó al final  ',
    })
    expect(await res.json()).toMatchObject({
      startedAt: f.startedAt - 30 * MIN,
      endedAt: f.endedAt! + 30 * MIN,
      plan: '18:6',
      goalMinutes: 1080,
      note: 'Me costó al final',
    })
    // Nota vacía = sin nota.
    expect(
      ((await (await c.patch(`/fasts/${f.id}`, { note: '   ' })).json()) as FastDto).note,
    ).toBeNull()
  })

  it('al ayuno en curso no se le puede poner fin por PATCH', async () => {
    const { registered } = setup()
    const c = await registered()
    const f = (await (await c.post('/fasts', { plan: '16:8', goalMinutes: 960 })).json()) as FastDto
    expect((await c.patch(`/fasts/${f.id}`, { endedAt: T0 + 1000 })).status).toBe(409)
  })

  it('borrar un ayuno (también el activo, con sus avisos)', async () => {
    const { registered, db } = setup()
    const c = await registered()
    const f = (await (await c.post('/fasts', { plan: '16:8', goalMinutes: 960 })).json()) as FastDto
    expect(db.select().from(notificationJobs).all().length).toBeGreaterThan(0)
    expect((await c.call('DELETE', `/fasts/${f.id}`)).status).toBe(200)
    expect(((await (await c.get('/fasts/active')).json()) as ActiveFastDto).active).toBeNull()
    expect(db.select().from(notificationJobs).all()).toHaveLength(0)
    expect((await c.call('DELETE', `/fasts/${f.id}`)).status).toBe(404)
  })

  it('estadísticas del usuario', async () => {
    const { registered } = setup()
    const c = await registered()
    await c.post('/fasts/manual', manual(1, 16))
    await c.post('/fasts/manual', manual(25, 17))
    await c.post('/fasts/manual', manual(49, 10))
    const s = (await (await c.get('/fasts/stats')).json()) as StatsDto
    expect(s).toMatchObject({ totalFasts: 3, currentStreak: 2, bestStreak: 2, goalRate30: 67 })
    expect(s.last7Days).toHaveLength(7)
  })
})

describe('peso (M4)', () => {
  // T0 = 5 nov 2026 20:00 UTC; la usuaria está en Atlantic/Canary (UTC+0): hoy es 2026-11-05.
  it('crear, sobrescribir el mismo día, listar ordenado y borrar', async () => {
    const { registered } = setup()
    const c = await registered()
    expect((await c.call('PUT', '/weights/2026-11-05', { kg: 64.25 })).status).toBe(200)
    await c.call('PUT', '/weights/2026-11-01', { kg: 65, note: 'después del finde' })
    const updated = await c.call('PUT', '/weights/2026-11-05', { kg: 63.9 })
    expect(await updated.json()).toEqual({ day: '2026-11-05', kg: 63.9, note: null })

    const list = (await (await c.get('/weights')).json()) as WeightDto[]
    expect(list).toEqual([
      { day: '2026-11-01', kg: 65, note: 'después del finde' },
      { day: '2026-11-05', kg: 63.9, note: null },
    ])

    expect((await c.call('DELETE', '/weights/2026-11-01')).status).toBe(200)
    expect((await c.call('DELETE', '/weights/2026-11-01')).status).toBe(404)
    expect((await (await c.get('/weights')).json()) as WeightDto[]).toHaveLength(1)
  })

  it('redondea a un decimal y valida rango, fecha y futuro', async () => {
    const { registered } = setup()
    const c = await registered()
    expect(await (await c.call('PUT', '/weights/2026-11-05', { kg: 70.04 })).json()).toMatchObject({
      kg: 70,
    })
    expect((await c.call('PUT', '/weights/2026-11-05', { kg: 5 })).status).toBe(400)
    expect((await c.call('PUT', '/weights/2026-02-30', { kg: 60 })).status).toBe(400)
    // Mañana se permite (margen de zona horaria); pasado mañana no.
    expect((await c.call('PUT', '/weights/2026-11-06', { kg: 60 })).status).toBe(200)
    expect((await c.call('PUT', '/weights/2026-11-07', { kg: 60 })).status).toBe(400)
  })

  it('cada usuario ve solo su peso', async () => {
    const { registered } = setup()
    const ella = await registered('ella@ejemplo.es')
    const el = await registered('el@ejemplo.es')
    await ella.call('PUT', '/weights/2026-11-05', { kg: 60 })
    expect((await (await el.get('/weights')).json()) as WeightDto[]).toEqual([])
    expect((await el.call('DELETE', '/weights/2026-11-05')).status).toBe(404)
  })

  it('peso objetivo en ajustes (y se puede quitar)', async () => {
    const { registered } = setup()
    const c = await registered()
    expect(await (await c.patch('/settings', { weightGoalKg: 58.26 })).json()).toMatchObject({
      weightGoalKg: 58.3,
    })
    expect(await (await c.patch('/settings', { weightGoalKg: null })).json()).toMatchObject({
      weightGoalKg: null,
    })
  })
})

describe('Turnstile en login y registro', () => {
  /** Verificador falso: acepta solo el token 'bueno' para la acción indicada, y una sola vez. */
  function fakeTurnstile() {
    const used = new Set<string>()
    const calls: Array<{ token: unknown; action: string }> = []
    const verifier: TurnstileVerifier = {
      async verify(token, action) {
        calls.push({ token, action })
        if (typeof token !== 'string' || token === '') return { ok: false, reason: 'missing' }
        if (token === 'caido') return { ok: false, reason: 'unavailable' }
        if (!token.startsWith(`bueno-${action}`) || used.has(token)) {
          return { ok: false, reason: 'invalid' }
        }
        used.add(token)
        return { ok: true }
      },
    }
    return { verifier, calls }
  }

  const registerBody = (extra: object = {}) => ({
    email: 'nueva@ejemplo.es',
    password: 'contraseña-segura',
    name: 'Nueva',
    inviteCode: INVITE,
    timezone: 'Atlantic/Canary',
    ...extra,
  })

  it('expone la clave pública del widget (y null si está desactivado)', async () => {
    const on = setup(undefined, { turnstile: fakeTurnstile().verifier })
    expect(await (await on.client().get('/auth/config')).json()).toEqual({
      turnstileSiteKey: 'site-key-de-prueba',
    })
    const off = setup()
    expect(await (await off.client().get('/auth/config')).json()).toEqual({
      turnstileSiteKey: null,
    })
  })

  it('el registro exige un token válido, y antes que el código de invitación', async () => {
    const { verifier, calls } = fakeTurnstile()
    const { client } = setup(undefined, { turnstile: verifier })
    const c = client()
    const sinToken = await c.post('/auth/register', registerBody())
    expect(sinToken.status).toBe(403)
    expect(await sinToken.json()).toEqual({ error: 'captcha_failed' })
    // Con código de invitación malo pero sin captcha válido, no revela si el código es correcto.
    const malo = await c.post(
      '/auth/register',
      registerBody({ inviteCode: 'otro', turnstileToken: 'x' }),
    )
    expect(await malo.json()).toEqual({ error: 'captcha_failed' })
    // El token de login no sirve para registrarse.
    expect(
      (await c.post('/auth/register', registerBody({ turnstileToken: 'bueno-login-1' }))).status,
    ).toBe(403)
    expect(
      (await c.post('/auth/register', registerBody({ turnstileToken: 'bueno-register-1' }))).status,
    ).toBe(201)
    expect(calls.map((x) => x.action)).toEqual(['register', 'register', 'register', 'register'])
  })

  it('el login exige token, no admite reutilizarlo y falla cerrado si Cloudflare no responde', async () => {
    const { verifier } = fakeTurnstile()
    const { client } = setup(undefined, { turnstile: verifier })
    await client().post('/auth/register', registerBody({ turnstileToken: 'bueno-register-0' }))
    const c = client()
    const creds = { email: 'nueva@ejemplo.es', password: 'contraseña-segura' }

    expect((await c.post('/auth/login', creds)).status).toBe(403)
    const caido = await c.post('/auth/login', { ...creds, turnstileToken: 'caido' })
    expect(caido.status).toBe(503)
    expect(await caido.json()).toEqual({ error: 'captcha_unavailable' })

    expect(
      (await c.post('/auth/login', { ...creds, turnstileToken: 'bueno-login-1' })).status,
    ).toBe(200)
    // El mismo token por segunda vez: rechazado.
    expect(
      (await client().post('/auth/login', { ...creds, turnstileToken: 'bueno-login-1' })).status,
    ).toBe(403)
  })

  it('con captcha válido pero contraseña mala, sigue siendo 401', async () => {
    const { verifier } = fakeTurnstile()
    const { client } = setup(undefined, { turnstile: verifier })
    await client().post('/auth/register', registerBody({ turnstileToken: 'bueno-register-0' }))
    const res = await client().post('/auth/login', {
      email: 'nueva@ejemplo.es',
      password: 'mala',
      turnstileToken: 'bueno-login-9',
    })
    expect(res.status).toBe(401)
  })
})

describe('endurecimiento', () => {
  it('limita los intentos de login por email aunque cambie la IP', async () => {
    const { client } = setup()
    let last = 0
    for (let i = 0; i < 11; i++) {
      const res = await client().call(
        'POST',
        '/auth/login',
        { email: 'objetivo@ejemplo.es', password: 'x' },
        { 'x-real-ip': `10.0.0.${i}` },
      )
      last = res.status
    }
    expect(last).toBe(429)
  })

  it('acertar la contraseña no reinicia el contador de intentos de la IP', async () => {
    const { registered, client } = setup()
    await registered('a@ejemplo.es')
    const ip = { 'x-real-ip': '9.9.9.9' }
    for (let i = 0; i < 9; i++) {
      await client().call('POST', '/auth/login', { email: 'b@ejemplo.es', password: 'x' }, ip)
    }
    const ok = await client().call(
      'POST',
      '/auth/login',
      { email: 'a@ejemplo.es', password: 'contraseña-segura' },
      ip,
    )
    expect(ok.status).toBe(200)
    const blocked = await client().call(
      'POST',
      '/auth/login',
      { email: 'b@ejemplo.es', password: 'x' },
      ip,
    )
    expect(blocked.status).toBe(429)
  })

  it('rechaza cuerpos demasiado grandes', async () => {
    const { client } = setup()
    const res = await client().post('/auth/login', {
      email: 'a@a.es',
      password: 'x'.repeat(70_000),
    })
    expect(res.status).toBe(413)
  })

  it('envía una CSP que solo permite código propio y el de Turnstile', async () => {
    const { client } = setup()
    const csp = (await client().get('/health')).headers.get('content-security-policy') ?? ''
    expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com")
    expect(csp).toContain('frame-src https://challenges.cloudflare.com')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
  })
})

describe('push: anti-SSRF en la API', () => {
  it('no deja registrar endpoints internos ni de servicios desconocidos', async () => {
    const { registered, db } = setup()
    const c = await registered()
    for (const endpoint of ['https://127.0.0.1:3100/api/health', 'https://intranet.example/x']) {
      const res = await c.post('/push/subscriptions', {
        endpoint,
        keys: { p256dh: 'p', auth: 'a' },
      })
      expect(res.status).toBe(400)
    }
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(0)
  })
})
