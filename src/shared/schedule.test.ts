import { describe, expect, it } from 'vitest'
import { buildFastJobs, type NotificationPrefs } from './schedule'
import { nextDailyOccurrence, offsetAt, wallTimeAt, zonedTimeToUtc } from './tz'

const MIN = 60 * 1000
const H = 60 * MIN
const T0 = Date.UTC(2026, 10, 5, 20, 0)
const all: NotificationPrefs = {
  notifyGoal: true,
  notifyPreEnd: true,
  preEndMinutes: 30,
  notifyMilestones: true,
}

describe('buildFastJobs', () => {
  it('16:8 recién empezado: hitos de 4 h y 12 h, aviso previo y objetivo', () => {
    const jobs = buildFastJobs({ id: 7, startedAt: T0, goalMinutes: 16 * 60 }, all, T0)
    expect(jobs.map((j) => [j.kind, (j.sendAt - T0) / MIN])).toEqual([
      ['milestone', 4 * 60],
      ['milestone', 12 * 60],
      ['pre_end', 16 * 60 - 30],
      ['goal', 16 * 60],
    ])
    expect(jobs.every((j) => j.payload.tag === 'fast-7')).toBe(true)
    expect(jobs.at(-1)!.payload.body).toContain('16 h')
  })

  it('un hito que coincide con el objetivo no se duplica (24 h)', () => {
    const jobs = buildFastJobs({ id: 1, startedAt: T0, goalMinutes: 24 * 60 }, all, T0)
    expect(jobs.filter((j) => j.kind === 'milestone').map((j) => (j.sendAt - T0) / H)).toEqual([
      4, 12, 18,
    ])
    expect(jobs.at(-1)!.kind).toBe('goal')
  })

  it('al empezar «antes», no programa lo que ya ha pasado', () => {
    const startedAt = T0 - 13 * H
    const jobs = buildFastJobs({ id: 1, startedAt, goalMinutes: 16 * 60 }, all, T0)
    expect(jobs.map((j) => j.kind)).toEqual(['pre_end', 'goal'])
  })

  it('objetivo ya pasado: nada que programar', () => {
    expect(buildFastJobs({ id: 1, startedAt: T0 - 20 * H, goalMinutes: 16 * 60 }, all, T0)).toEqual(
      [],
    )
  })

  it('respeta las preferencias desactivadas', () => {
    const jobs = buildFastJobs(
      { id: 1, startedAt: T0, goalMinutes: 16 * 60 },
      { ...all, notifyMilestones: false, notifyPreEnd: false },
      T0,
    )
    expect(jobs.map((j) => j.kind)).toEqual(['goal'])
  })

  it('el aviso previo no se programa si el ayuno es más corto que la antelación', () => {
    const jobs = buildFastJobs(
      { id: 1, startedAt: T0, goalMinutes: 60 },
      { ...all, preEndMinutes: 60 },
      T0,
    )
    expect(jobs.map((j) => j.kind)).toEqual(['goal'])
  })
})

describe('zonas horarias', () => {
  it('desfase de Madrid y Canarias en invierno y verano', () => {
    expect(offsetAt(Date.UTC(2026, 0, 15, 12), 'Europe/Madrid')).toBe(1 * H)
    expect(offsetAt(Date.UTC(2026, 6, 15, 12), 'Europe/Madrid')).toBe(2 * H)
    expect(offsetAt(Date.UTC(2026, 0, 15, 12), 'Atlantic/Canary')).toBe(0)
    expect(offsetAt(Date.UTC(2026, 6, 15, 12), 'Atlantic/Canary')).toBe(1 * H)
  })

  it('convierte hora local a UTC e ida y vuelta', () => {
    const ms = zonedTimeToUtc(
      { year: 2026, month: 11, day: 5, hour: 20, minute: 0 },
      'Europe/Madrid',
    )
    expect(ms).toBe(Date.UTC(2026, 10, 5, 19, 0))
    expect(wallTimeAt(ms, 'Europe/Madrid')).toMatchObject({ hour: 20, minute: 0 })
  })

  it('hora inexistente (salto de primavera) se mueve tras el salto', () => {
    // 29/03/2026 en Madrid: de 02:00 se pasa a 03:00.
    const ms = zonedTimeToUtc(
      { year: 2026, month: 3, day: 29, hour: 2, minute: 30 },
      'Europe/Madrid',
    )
    expect(wallTimeAt(ms, 'Europe/Madrid')).toMatchObject({ day: 29, hour: 3, minute: 30 })
  })

  it('hora repetida (otoño) devuelve la primera', () => {
    // 25/10/2026 en Madrid: 02:30 ocurre en CEST (00:30Z) y en CET (01:30Z).
    const ms = zonedTimeToUtc(
      { year: 2026, month: 10, day: 25, hour: 2, minute: 30 },
      'Europe/Madrid',
    )
    expect(ms).toBe(Date.UTC(2026, 9, 25, 0, 30))
  })
})

describe('nextDailyOccurrence', () => {
  it('hoy si aún no ha pasado, mañana si ya pasó', () => {
    const tz = 'Atlantic/Canary' // en noviembre, UTC+0
    const morning = Date.UTC(2026, 10, 5, 9, 0)
    expect(nextDailyOccurrence(morning, '20:00', tz)).toBe(Date.UTC(2026, 10, 5, 20, 0))
    const night = Date.UTC(2026, 10, 5, 21, 0)
    expect(nextDailyOccurrence(night, '20:00', tz)).toBe(Date.UTC(2026, 10, 6, 20, 0))
    // Justo a la hora: la siguiente es mañana (estrictamente posterior).
    expect(nextDailyOccurrence(Date.UTC(2026, 10, 5, 20, 0), '20:00', tz)).toBe(
      Date.UTC(2026, 10, 6, 20, 0),
    )
  })

  it('mantiene la hora local a través del cambio de hora', () => {
    const tz = 'Europe/Madrid'
    // Sábado 24/10/2026 a las 21:00 locales (CEST): la siguiente 20:00 es el domingo, ya en CET.
    const now = Date.UTC(2026, 9, 24, 19, 0)
    const next = nextDailyOccurrence(now, '20:00', tz)
    expect(next).toBe(Date.UTC(2026, 9, 25, 19, 0))
    expect(wallTimeAt(next, tz)).toMatchObject({ day: 25, hour: 20, minute: 0 })
  })

  it('cruza fin de mes y de año', () => {
    const tz = 'Europe/Madrid'
    const now = Date.UTC(2026, 11, 31, 22, 0) // 31/12 23:00 local
    expect(wallTimeAt(nextDailyOccurrence(now, '08:00', tz), tz)).toMatchObject({
      year: 2027,
      month: 1,
      day: 1,
      hour: 8,
    })
  })
})
