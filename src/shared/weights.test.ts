import { describe, expect, it } from 'vitest'
import { addDays, isValidDay, kgSchema, parseKg, summarizeWeights } from './weights'

describe('peso: utilidades', () => {
  it('valida días reales', () => {
    expect(isValidDay('2026-11-05')).toBe(true)
    expect(isValidDay('2028-02-29')).toBe(true)
    expect(isValidDay('2026-02-29')).toBe(false)
    expect(isValidDay('2026-13-01')).toBe(false)
    expect(isValidDay('5/11/2026')).toBe(false)
  })

  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('acepta coma o punto decimal y redondea a un decimal', () => {
    expect(parseKg('63,45')).toBe(63.45)
    expect(parseKg(' 70.2 ')).toBe(70.2)
    expect(parseKg('')).toBeNull()
    expect(parseKg('abc')).toBeNull()
    expect(kgSchema.parse(63.45)).toBe(63.5)
    expect(kgSchema.safeParse(10).success).toBe(false)
  })
})

describe('summarizeWeights', () => {
  const e = (day: string, kg: number) => ({ day, kg, note: null })

  it('sin registros', () => {
    expect(summarizeWeights([], '2026-11-05', 60)).toEqual({
      current: null,
      changeTotal: null,
      change30: null,
      toGoal: null,
    })
  })

  it('actual, variación total, a 30 días y lo que falta para el objetivo', () => {
    const s = summarizeWeights(
      [e('2026-11-05', 64.2), e('2026-09-01', 67), e('2026-10-01', 66.1), e('2026-10-20', 65)],
      '2026-11-05',
      62,
    )
    expect(s.current?.day).toBe('2026-11-05')
    expect(s.changeTotal).toBe(-2.8)
    // Referencia de 30 días: el último registro del 06/10 o antes, que es el del 01/10.
    expect(s.change30).toBe(-1.9)
    expect(s.toGoal).toBe(-2.2)
  })

  it('con un solo registro no hay variación', () => {
    const s = summarizeWeights([e('2026-11-05', 64)], '2026-11-05', null)
    expect(s.changeTotal).toBeNull()
    expect(s.change30).toBeNull()
    expect(s.toGoal).toBeNull()
  })
})
