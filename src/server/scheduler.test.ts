import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { FastDto } from '../shared/api'
import type { Db } from './db'
import { notificationJobs, settings } from './db/schema'
import type { PushSender, SendResult } from './push'
import { ensureReminders, Scheduler } from './scheduler'
import { fakeSender, H, setup, T0 } from './testing'

const MIN = 60 * 1000

function pendingJobs(db: Db) {
  return db
    .select()
    .from(notificationJobs)
    .where(eq(notificationJobs.status, 'pending'))
    .all()
    .sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime())
}

/** Entorno con una usuaria registrada, un dispositivo suscrito y el planificador con reloj falso. */
async function world(senderOverride?: PushSender) {
  const fake = fakeSender()
  const env = setup(senderOverride ?? fake.sender)
  const ella = await env.registered()
  await ella.post('/push/subscriptions', {
    endpoint: 'https://push.example/ella',
    keys: { p256dh: 'p', auth: 'a' },
  })
  const scheduler = new Scheduler({
    db: env.db,
    push: senderOverride ?? fake.sender,
    now: () => env.clock.now,
  })
  const at = async (ms: number) => {
    env.clock.now = ms
    return scheduler.tick()
  }
  const start = async (body: object = { plan: '16:8', goalMinutes: 960 }) =>
    (await (await ella.post('/fasts', body)).json()) as FastDto
  return { ...env, ...fake, ella, scheduler, at, start }
}

describe('avisos de un ayuno', () => {
  it('al empezar se programan los hitos, el aviso previo y el objetivo', async () => {
    const w = await world()
    await w.start()
    expect(pendingJobs(w.db).map((j) => [j.kind, (j.sendAt.getTime() - T0) / MIN])).toEqual([
      ['milestone', 4 * 60],
      ['milestone', 12 * 60],
      ['pre_end', 16 * 60 - 30],
      ['goal', 16 * 60],
    ])
  })

  it('se envían a su hora, ni antes ni después', async () => {
    const w = await world()
    await w.start()

    expect(await w.at(T0 + 4 * H - 1000)).toMatchObject({ sent: 0 })
    expect(await w.at(T0 + 4 * H)).toMatchObject({ sent: 1 })
    expect(w.payloads.at(-1)?.title).toContain('Bajada de azúcar')

    await w.at(T0 + 12 * H)
    await w.at(T0 + 16 * H - 30 * MIN)
    expect(await w.at(T0 + 16 * H)).toMatchObject({ sent: 1 })
    expect(w.payloads.map((p) => p.title)).toEqual([
      '📉 Bajada de azúcar',
      '🔥 Quema de grasa',
      'Ya casi está ⏳',
      '¡Objetivo cumplido! 🎉',
    ])
    expect(pendingJobs(w.db)).toHaveLength(0)
    // Un tick más no reenvía nada.
    expect(await w.at(T0 + 17 * H)).toMatchObject({ sent: 0 })
  })

  it('al terminar el ayuno se cancelan los avisos pendientes', async () => {
    const w = await world()
    const f = await w.start()
    w.clock.now = T0 + 5 * H
    await w.ella.post(`/fasts/${f.id}/stop`)
    expect(pendingJobs(w.db)).toHaveLength(0)
    expect(await w.at(T0 + 16 * H)).toMatchObject({ sent: 0 })
  })

  it('al editar la hora de inicio se reprograman', async () => {
    const w = await world()
    const f = await w.start()
    await w.ella.patch(`/fasts/${f.id}`, { startedAt: T0 - 2 * H })
    const goal = pendingJobs(w.db).find((j) => j.kind === 'goal')!
    expect(goal.sendAt.getTime()).toBe(T0 - 2 * H + 16 * H)
    // Los hitos que ya pasaron no se programan.
    expect(pendingJobs(w.db).filter((j) => j.kind === 'milestone')).toHaveLength(2)
  })

  it('al cambiar las preferencias se reprograma el ayuno en curso', async () => {
    const w = await world()
    await w.start()
    await w.ella.patch('/settings', { notifyMilestones: false, preEndMinutes: 60 })
    expect(pendingJobs(w.db).map((j) => [j.kind, (j.sendAt.getTime() - T0) / MIN])).toEqual([
      ['pre_end', 15 * 60],
      ['goal', 16 * 60],
    ])
  })

  it('tras una caída: los avisos atrasados se descartan, salvo el de objetivo', async () => {
    const w = await world()
    await w.start()
    // El servidor «vuelve» 20 min después del objetivo: todo está vencido.
    const r = await w.at(T0 + 16 * H + 20 * MIN)
    expect(r).toMatchObject({ sent: 1, skipped: 3 })
    expect(w.payloads.map((p) => p.title)).toEqual(['¡Objetivo cumplido! 🎉'])
  })

  it('sin dispositivos registrados no se envía nada y no se reintenta', async () => {
    const fake = fakeSender()
    const env = setup(fake.sender)
    const c = await env.registered()
    await c.post('/fasts', { plan: '16:8', goalMinutes: 960 })
    const scheduler = new Scheduler({ db: env.db, push: fake.sender, now: () => env.clock.now })
    env.clock.now = T0 + 4 * H
    expect(await scheduler.tick()).toMatchObject({ sent: 0, skipped: 1 })
  })

  it('reintenta los fallos temporales y se rinde tras 3 intentos', async () => {
    const failing: PushSender = {
      async send(): Promise<SendResult> {
        return { ok: false, gone: false, status: 503, error: 'no disponible' }
      },
    }
    const w = await world(failing)
    await w.start()
    expect(await w.at(T0 + 4 * H)).toMatchObject({ retried: 1 })
    expect(await w.at(T0 + 4 * H + 1 * MIN)).toMatchObject({ retried: 1 })
    expect(await w.at(T0 + 4 * H + 3 * MIN)).toMatchObject({ failed: 1 })
    const job = w.db
      .select()
      .from(notificationJobs)
      .where(and(eq(notificationJobs.kind, 'milestone')))
      .all()[0]!
    expect(job).toMatchObject({ status: 'failed', attempts: 3 })
  })
})

describe('recordatorio diario', () => {
  // La usuaria está en Atlantic/Canary: en noviembre, UTC+0.
  it('se programa a la hora local y se repite cada día', async () => {
    const w = await world()
    w.clock.now = T0 + 1 * H // 5 nov, 21:00
    await w.ella.patch('/settings', { reminderEnabled: true, reminderTime: '20:00' })
    const [job] = pendingJobs(w.db)
    expect(job).toMatchObject({ kind: 'daily_reminder' })
    expect(job!.sendAt.getTime()).toBe(Date.UTC(2026, 10, 6, 20, 0))

    expect(await w.at(Date.UTC(2026, 10, 6, 20, 0))).toMatchObject({ sent: 1 })
    expect(w.payloads.at(-1)?.title).toBe('¿Empezamos? 🌅')
    const next = pendingJobs(w.db)
    expect(next).toHaveLength(1)
    expect(next[0]!.sendAt.getTime()).toBe(Date.UTC(2026, 10, 7, 20, 0))
  })

  it('no se envía si ya está ayunando, pero se programa el del día siguiente', async () => {
    const w = await world()
    await w.ella.patch('/settings', { reminderEnabled: true, reminderTime: '20:00' })
    await w.start({ plan: '20:4', goalMinutes: 20 * 60, startedAt: T0 + 0 }) // 5 nov 20:00
    const r = await w.at(Date.UTC(2026, 10, 6, 20, 0))
    expect(w.payloads.some((p) => p.title === '¿Empezamos? 🌅')).toBe(false)
    expect(r.skipped).toBeGreaterThanOrEqual(1)
    expect(pendingJobs(w.db).some((j) => j.kind === 'daily_reminder')).toBe(true)
  })

  it('al cambiar de zona horaria se recalcula', async () => {
    const w = await world()
    await w.ella.patch('/settings', { reminderEnabled: true, reminderTime: '20:00' })
    await w.ella.patch('/me', { timezone: 'Europe/Madrid' }) // UTC+1 en noviembre
    const [job] = pendingJobs(w.db)
    expect(job!.sendAt.getTime()).toBe(Date.UTC(2026, 10, 6, 19, 0))
  })

  it('al desactivarlo se cancela', async () => {
    const w = await world()
    await w.ella.patch('/settings', { reminderEnabled: true })
    await w.ella.patch('/settings', { reminderEnabled: false })
    expect(pendingJobs(w.db)).toHaveLength(0)
  })

  it('ensureReminders repara recordatorios perdidos al arrancar', async () => {
    const w = await world()
    w.db.update(settings).set({ reminderEnabled: true }).run()
    expect(pendingJobs(w.db)).toHaveLength(0)
    ensureReminders(w.db, w.clock.now)
    expect(pendingJobs(w.db).map((j) => j.kind)).toEqual(['daily_reminder'])
    ensureReminders(w.db, w.clock.now) // idempotente
    expect(pendingJobs(w.db)).toHaveLength(1)
  })
})
