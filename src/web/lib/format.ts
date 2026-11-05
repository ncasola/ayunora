const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const pad = (n: number) => String(n).padStart(2, '0')

/** 15:32:07. Las horas pueden pasar de 24. */
export function formatHms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** «2 h 10 min», «45 min», «16 h». Redondea al minuto hacia abajo. */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / MINUTE))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export function formatGoal(minutes: number): string {
  return formatDuration(minutes * MINUTE)
}

const clockFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

export function formatClock(ms: number): string {
  return clockFmt.format(ms)
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** «hoy 20:15», «mañana 12:15», «ayer 21:00» o «lun, 3 nov 12:15». */
export function formatDayClock(ms: number, now: number): string {
  const diffDays = Math.round((startOfDay(ms) - startOfDay(now)) / DAY)
  const clock = formatClock(ms)
  if (diffDays === 0) return `hoy ${clock}`
  if (diffDays === 1) return `mañana ${clock}`
  if (diffDays === -1) return `ayer ${clock}`
  return `${dayFmt.format(ms)} ${clock}`
}

/** Valor para `<input type="datetime-local">` en hora local: YYYY-MM-DDTHH:mm. */
export function toDateTimeLocal(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Inverso de `toDateTimeLocal`: interpreta el valor en hora local. */
export function fromDateTimeLocal(value: string): number {
  return new Date(value).getTime()
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Primera letra en mayúscula («lunes, 2 de noviembre» → «Lunes, 2 de noviembre»). CSS `capitalize` haría «De Noviembre». */
export function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
