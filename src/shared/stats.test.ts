import { describe, expect, it } from 'vitest'
import { computeStats, type FastForStats } from './stats'

const MIN = 60 * 1000
const H = 60 * MIN
const TZ = 'Europe/Madrid' // UTC+1 en noviembre

/** Ayuno que termina el día `day` de noviembre de 2026 a las `endHourLocal` (hora de Madrid). */
function fast(day: number, hours: number, goalHours = 16, endHourLocal = 12): FastForStats {
  const endedAt = Date.UTC(2026, 10, day, endHourLocal - 1, 0)
  return { startedAt: endedAt - hours * H, endedAt, goalMinutes: goalHours * 60 }
}

// "Ahora": 10 de noviembre de 2026, 18:00 en Madrid.
const NOW = Date.UTC(2026, 10, 10, 17, 0)

describe('computeStats', () => {
  it('sin ayunos', () => {
    const s = computeStats([], TZ, NOW)
    expect(s).toMatchObject({
      currentStreak: 0,
      bestStreak: 0,
      totalFasts: 0,
      avg7Minutes: null,
      goalRate30: null,
    })
    expect(s.last7Days).toHaveLength(7)
    expect(s.last7Days.at(-1)).toEqual({ day: '2026-11-10', minutes: 0, goalMet: false })
    expect(s.last7Days[0]!.day).toBe('2026-11-04')
  })

  it('racha actual incluyendo hoy', () => {
    const s = computeStats([fast(8, 16), fast(9, 17), fast(10, 16)], TZ, NOW)
    expect(s.currentStreak).toBe(3)
    expect(s.bestStreak).toBe(3)
  })

  it('si hoy aún no hay ayuno, la racha sigue viva desde ayer', () => {
    const s = computeStats([fast(8, 16), fast(9, 16)], TZ, NOW)
    expect(s.currentStreak).toBe(2)
  })

  it('un día sin cumplir rompe la racha; la mejor se conserva', () => {
    const fasts = [
      fast(3, 16),
      fast(4, 16),
      fast(5, 16),
      fast(6, 16),
      fast(7, 10),
      fast(9, 16),
      fast(10, 16),
    ]
    const s = computeStats(fasts, TZ, NOW)
    expect(s.currentStreak).toBe(2)
    expect(s.bestStreak).toBe(4)
  })

  it('anteayer como último día cumplido: racha actual 0', () => {
    expect(computeStats([fast(8, 16)], TZ, NOW).currentStreak).toBe(0)
  })

  it('el día se cuenta en la zona horaria del usuario', () => {
    // Termina a las 00:30 del 10/11 en Madrid, que en UTC aún es el 9/11 a las 23:30.
    const endedAt = Date.UTC(2026, 10, 9, 23, 30)
    const f: FastForStats = { startedAt: endedAt - 16 * H, endedAt, goalMinutes: 960 }
    expect(computeStats([f], TZ, NOW).last7Days.at(-1)).toMatchObject({
      day: '2026-11-10',
      goalMet: true,
    })
    expect(computeStats([f], 'UTC', NOW).last7Days.at(-2)).toMatchObject({
      day: '2026-11-09',
      goalMet: true,
    })
  })

  it('totales, más largo, medias y porcentaje de objetivos', () => {
    const fasts = [fast(10, 16), fast(9, 18), fast(8, 12), fast(1, 20)]
    const s = computeStats(fasts, TZ, NOW)
    expect(s.totalFasts).toBe(4)
    expect(s.totalMinutes).toBe((16 + 18 + 12 + 20) * 60)
    expect(s.longestMinutes).toBe(20 * 60)
    expect(s.avg7Minutes).toBe(((16 + 18 + 12) * 60) / 3)
    expect(s.avg30Minutes).toBe(((16 + 18 + 12 + 20) * 60) / 4)
    expect(s.goalRate30).toBe(75)
  })

  it('dos ayunos el mismo día se suman en el gráfico', () => {
    const s = computeStats([fast(10, 13, 13, 8), fast(10, 3, 16, 15)], TZ, NOW)
    expect(s.last7Days.at(-1)).toEqual({ day: '2026-11-10', minutes: 16 * 60, goalMet: true })
  })
})
