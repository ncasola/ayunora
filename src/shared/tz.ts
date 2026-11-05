// Utilidades de zona horaria basadas solo en Intl, sin dependencias, para el cliente y el
// servidor. Resuelven «qué instante UTC son las 20:00 en Atlantic/Canary» teniendo en
// cuenta los cambios de hora.

type WallTime = { year: number; month: number; day: number; hour: number; minute: number }

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatterFor(timeZone: string) {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/** Hora de reloj (local) de un instante en una zona horaria. */
export function wallTimeAt(ms: number, timeZone: string): WallTime & { second: number } {
  const parts: Record<string, number> = {}
  for (const p of formatterFor(timeZone).formatToParts(ms)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  }
}

/** Desfase de la zona respecto a UTC en ese instante, en ms (p. ej. +1 h en Madrid en invierno). */
export function offsetAt(ms: number, timeZone: string): number {
  const w = wallTimeAt(ms, timeZone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUtc - Math.floor(ms / 1000) * 1000
}

/**
 * Instante UTC de una hora de reloj en una zona. Si esa hora no existe (salto de primavera),
 * devuelve la equivalente justo después del salto (02:30 → 03:30). Si existe dos veces (otoño),
 * devuelve la primera.
 */
export function zonedTimeToUtc(wall: WallTime, timeZone: string): number {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
  // Los cambios de hora no están a menos de 12 h unos de otros, así que el desfase vigente
  // antes y después de esa hora de reloj son los únicos candidatos posibles.
  const offBefore = offsetAt(asUtc - 12 * 3600_000, timeZone)
  const offAfter = offsetAt(asUtc + 12 * 3600_000, timeZone)

  const matches = (ms: number) => {
    const w = wallTimeAt(ms, timeZone)
    return (
      w.year === wall.year &&
      w.month === wall.month &&
      w.day === wall.day &&
      w.hour === wall.hour &&
      w.minute === wall.minute
    )
  }
  const valid = [asUtc - offBefore, asUtc - offAfter].filter(matches)
  // Otoño: la hora existe dos veces y gana la primera. Caso normal: los dos candidatos coinciden.
  if (valid.length > 0) return Math.min(...valid)
  // Primavera: la hora no existe. Con el desfase de antes del salto cae justo después
  // (02:30 → 03:30).
  return asUtc - offBefore
}

/** 'HH:MM' → { hour, minute }. */
export function parseHhMm(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(':').map(Number)
  return { hour: h ?? 0, minute: m ?? 0 }
}

/** Próximo instante, estrictamente posterior a `now`, en que el reloj local marca `hhmm`. */
export function nextDailyOccurrence(now: number, hhmm: string, timeZone: string): number {
  const { hour, minute } = parseHhMm(hhmm)
  const today = wallTimeAt(now, timeZone)
  for (let addDays = 0; addDays < 3; addDays++) {
    // Date.UTC normaliza el desbordamiento de días (31 → 1 del mes siguiente).
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + addDays))
    const candidate = zonedTimeToUtc(
      {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour,
        minute,
      },
      timeZone,
    )
    if (candidate > now) return candidate
  }
  throw new Error('nextDailyOccurrence: no se encontró ocurrencia')
}
