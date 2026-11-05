import { describe, expect, it } from 'vitest'
import { registerSchema, startFastSchema } from './api'
import { PHASES, phaseAt } from './phases'
import { goalMinutesFor, isValidGoalMinutes } from './plans'

const H = 60 * 60 * 1000

describe('planes', () => {
  it('calcula el objetivo de cada plan', () => {
    expect(goalMinutesFor('16:8', 999)).toBe(960)
    expect(goalMinutesFor('omad', 999)).toBe(23 * 60)
    expect(goalMinutesFor('custom', 13 * 60 + 30)).toBe(13 * 60 + 30)
  })

  it('valida los límites del objetivo personalizado', () => {
    expect(isValidGoalMinutes(60)).toBe(true)
    expect(isValidGoalMinutes(72 * 60)).toBe(true)
    expect(isValidGoalMinutes(45)).toBe(false)
    expect(isValidGoalMinutes(72 * 60 + 15)).toBe(false)
    expect(isValidGoalMinutes(16 * 60 + 10)).toBe(false)
  })
})

describe('fases', () => {
  it('están ordenadas y empiezan en 0 h', () => {
    expect(PHASES[0]!.startHour).toBe(0)
    const hours = PHASES.map((p) => p.startHour)
    expect([...hours].sort((a, b) => a - b)).toEqual(hours)
  })

  it('devuelve la fase actual y el tiempo hasta la siguiente', () => {
    expect(phaseAt(0).phase.id).toBe('digestion')
    expect(phaseAt(-5000).phase.id).toBe('digestion')

    const at13 = phaseAt(13 * H)
    expect(at13.phase.id).toBe('fat-burn')
    expect(at13.next?.id).toBe('ketosis')
    expect(at13.msToNext).toBe(5 * H)

    expect(phaseAt(12 * H).phase.id).toBe('fat-burn') // el límite entra en la fase nueva
    expect(phaseAt(12 * H - 1).phase.id).toBe('sugar-drop')
  })

  it('la última fase no tiene siguiente', () => {
    const s = phaseAt(30 * H)
    expect(s.phase.id).toBe('autophagy')
    expect(s.next).toBeNull()
    expect(s.msToNext).toBeNull()
  })
})

describe('esquemas de la API', () => {
  it('normaliza el email y valida la zona horaria', () => {
    const ok = registerSchema.parse({
      email: '  Ella@Ejemplo.ES ',
      password: '12345678',
      name: 'Ella',
      inviteCode: 'x',
      timezone: 'Atlantic/Canary',
    })
    expect(ok.email).toBe('ella@ejemplo.es')
    expect(
      registerSchema.safeParse({ ...ok, password: '12345678', timezone: 'Marte/Olympus' }).success,
    ).toBe(false)
  })

  it('rechaza objetivos fuera de rango al empezar', () => {
    expect(startFastSchema.safeParse({ plan: '16:8', goalMinutes: 960 }).success).toBe(true)
    expect(startFastSchema.safeParse({ plan: '16:8', goalMinutes: 30 }).success).toBe(false)
  })
})
