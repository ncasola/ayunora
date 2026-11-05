import { wallTimeAt } from './tz'

// Estadísticas del historial, como cálculo puro (SPEC §4.7). Cada ayuno cuenta para el día
// en que TERMINA, en la zona horaria del usuario.

export type FastForStats = { startedAt: number; endedAt: number; goalMinutes: number }

export type DayStat = {
  /** 'YYYY-MM-DD' en la zona del usuario. */
  day: string
  /** Minutos ayunados en los ayunos que terminaron ese día. */
  minutes: number
  goalMet: boolean
}

export type StatsDto = {
  currentStreak: number
  bestStreak: number
  totalFasts: number
  totalMinutes: number
  longestMinutes: number
  /** Duración media de los ayunos de los últimos 7 y 30 días. `null` si no hay ninguno. */
  avg7Minutes: number | null
  avg30Minutes: number | null
  /** Porcentaje (0..100) de ayunos de los últimos 30 días que cumplieron su objetivo. */
  goalRate30: number | null
  /** Los últimos 7 días, del más antiguo a hoy. */
  last7Days: DayStat[]
}

const MINUTE = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE

const durationMinutes = (f: FastForStats) => Math.round((f.endedAt - f.startedAt) / MINUTE)
const metGoal = (f: FastForStats) => f.endedAt - f.startedAt >= f.goalMinutes * MINUTE

/** Número de día absoluto de la fecha local: dos días consecutivos difieren en 1. */
function localDayNumber(ms: number, timeZone: string): number {
  const w = wallTimeAt(ms, timeZone)
  return Date.UTC(w.year, w.month - 1, w.day) / DAY_MS
}

function dayNumberToIso(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

export function computeStats(fasts: FastForStats[], timeZone: string, now: number): StatsDto {
  const today = localDayNumber(now, timeZone)

  // Días (locales) con al menos un ayuno que cumplió su objetivo.
  const goalDays = new Set<number>()
  for (const f of fasts) if (metGoal(f)) goalDays.add(localDayNumber(f.endedAt, timeZone))

  // Racha actual: días seguidos hasta hoy. Si hoy aún no hay ayuno cumplido, la racha
  // sigue viva desde ayer: el día todavía no ha terminado.
  let currentStreak = 0
  let cursor = goalDays.has(today) ? today : today - 1
  while (goalDays.has(cursor)) {
    currentStreak++
    cursor--
  }

  let bestStreak = 0
  let run = 0
  let prev: number | undefined
  for (const d of [...goalDays].sort((a, b) => a - b)) {
    run = prev !== undefined && d === prev + 1 ? run + 1 : 1
    bestStreak = Math.max(bestStreak, run)
    prev = d
  }

  const inLast = (days: number) => fasts.filter((f) => f.endedAt > now - days * DAY_MS)
  const last30 = inLast(30)

  const last7Days: DayStat[] = []
  for (let n = today - 6; n <= today; n++) {
    const ofDay = fasts.filter((f) => localDayNumber(f.endedAt, timeZone) === n)
    last7Days.push({
      day: dayNumberToIso(n),
      minutes: ofDay.reduce((sum, f) => sum + durationMinutes(f), 0),
      goalMet: ofDay.some(metGoal),
    })
  }

  return {
    currentStreak,
    bestStreak,
    totalFasts: fasts.length,
    totalMinutes: fasts.reduce((sum, f) => sum + durationMinutes(f), 0),
    longestMinutes: fasts.reduce((max, f) => Math.max(max, durationMinutes(f)), 0),
    avg7Minutes: average(inLast(7).map(durationMinutes)),
    avg30Minutes: average(last30.map(durationMinutes)),
    goalRate30:
      last30.length === 0
        ? null
        : Math.round((last30.filter(metGoal).length / last30.length) * 100),
    last7Days,
  }
}
