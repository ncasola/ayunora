import { z } from 'zod'

// Registro de peso (SPEC §4.8). Un registro por usuario y día local; el día es 'YYYY-MM-DD'.

export const WEIGHT_LIMITS = { min: 20, max: 400 } as const

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** ¿Es 'YYYY-MM-DD' una fecha real? (descarta el 31 de febrero, etc.) */
export function isValidDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export const daySchema = z.string().refine(isValidDay, 'Fecha no válida')

/** kg con un decimal. Acepta lo que venga del teclado y lo redondea. */
export const kgSchema = z
  .number()
  .min(WEIGHT_LIMITS.min, `El peso debe estar entre ${WEIGHT_LIMITS.min} y ${WEIGHT_LIMITS.max} kg`)
  .max(WEIGHT_LIMITS.max, `El peso debe estar entre ${WEIGHT_LIMITS.min} y ${WEIGHT_LIMITS.max} kg`)
  .transform((n) => Math.round(n * 10) / 10)

export const putWeightSchema = z.object({
  kg: kgSchema,
  note: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((s) => (s ? s : null)),
})
export type PutWeightInput = z.input<typeof putWeightSchema>

export type WeightDto = { day: string; kg: number; note: string | null }

/** Interpreta lo que escribe el usuario: «63,4» o «63.4». */
export function parseKg(input: string): number | null {
  const n = Number(input.trim().replace(',', '.'))
  return Number.isFinite(n) && input.trim() !== '' ? n : null
}

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

export type WeightSummary = {
  current: WeightDto | null
  /** Variación desde el primer registro (kg, con signo). */
  changeTotal: number | null
  /** Variación respecto al último registro de hace 30 días o más. */
  change30: number | null
  /** Lo que falta para el objetivo (kg, con signo: negativo = hay que bajar). */
  toGoal: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** `entries` en cualquier orden. `today` es el día local del usuario. */
export function summarizeWeights(
  entries: WeightDto[],
  today: string,
  goalKg: number | null,
): WeightSummary {
  const sorted = [...entries].sort((a, b) => a.day.localeCompare(b.day))
  const current = sorted.at(-1) ?? null
  const first = sorted[0]
  const cutoff = addDays(today, -30)
  const ref30 = [...sorted].reverse().find((e) => e.day <= cutoff)
  return {
    current,
    changeTotal: current && first && sorted.length > 1 ? round1(current.kg - first.kg) : null,
    change30: current && ref30 ? round1(current.kg - ref30.kg) : null,
    toGoal: current && goalKg !== null ? round1(goalKg - current.kg) : null,
  }
}
