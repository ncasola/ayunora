import { z } from 'zod'
import { GOAL_LIMITS, isValidGoalMinutes, PLAN_IDS, type PlanId } from './plans'
import { PRE_END_OPTIONS, type PreEndMinutes } from './schedule'
import { kgSchema } from './weights'

// Contrato de la API compartido por cliente y servidor.
// Todas las fechas viajan como milisegundos UTC (number).

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// Primero se recorta y se pasa a minúsculas, y después se valida: el autocompletado de iOS
// a veces añade espacios.
const email = z.string().trim().toLowerCase().pipe(z.email('Email no válido').max(254))
const timezone = z.string().refine(isValidTimeZone, 'Zona horaria no válida')
const goalMinutes = z
  .number()
  .int()
  .refine(
    isValidGoalMinutes,
    `El objetivo debe estar entre ${GOAL_LIMITS.min / 60} y ${GOAL_LIMITS.max / 60} h, en saltos de 15 min`,
  )
const epochMs = z.number().int().nonnegative()
const name = z.string().trim().min(1, 'Pon tu nombre').max(50)

export const registerSchema = z.object({
  email,
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200),
  name,
  inviteCode: z.string().min(1, 'Falta el código de invitación'),
  timezone,
})
export type RegisterInput = z.input<typeof registerSchema>

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
})
export type LoginInput = z.input<typeof loginSchema>

export const updateMeSchema = z.object({ name, timezone }).partial()
export type UpdateMeInput = z.infer<typeof updateMeSchema>

export const planIdSchema = z.enum(PLAN_IDS)

export const updateSettingsSchema = z
  .object({
    defaultPlan: planIdSchema,
    customGoalMinutes: goalMinutes,
    notifyGoal: z.boolean(),
    notifyPreEnd: z.boolean(),
    preEndMinutes: z.union(PRE_END_OPTIONS.map((n) => z.literal(n))),
    notifyMilestones: z.boolean(),
    reminderEnabled: z.boolean(),
    reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:MM)'),
    weightGoalKg: kgSchema.nullable(),
  })
  .partial()
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>

export const startFastSchema = z.object({
  plan: planIdSchema,
  goalMinutes,
  startedAt: epochMs.optional(),
})
export type StartFastInput = z.infer<typeof startFastSchema>

export const stopFastSchema = z.object({ endedAt: epochMs.optional() })
export type StopFastInput = z.infer<typeof stopFastSchema>

const note = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((s) => (s ? s : null))

export const updateFastSchema = z
  .object({
    startedAt: epochMs,
    /** Solo en ayunos ya terminados. El activo se termina con /stop. */
    endedAt: epochMs,
    plan: planIdSchema,
    goalMinutes,
    note,
  })
  .partial()
export type UpdateFastInput = z.input<typeof updateFastSchema>

/** Añadir a mano un ayuno pasado que se olvidó registrar. */
export const manualFastSchema = z.object({
  startedAt: epochMs,
  endedAt: epochMs,
  plan: planIdSchema,
  goalMinutes,
  note: note.optional(),
})
export type ManualFastInput = z.input<typeof manualFastSchema>

export const listFastsQuerySchema = z.object({
  /** Cursor: devuelve los ayunos que empezaron antes de este instante. */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/** Duración máxima de un ayuno registrado. */
export const MAX_FAST_MS = 7 * 24 * 60 * 60 * 1000

// ---- Respuestas ----

export type UserDto = { id: number; email: string; name: string; timezone: string }

export type SettingsDto = {
  defaultPlan: PlanId
  customGoalMinutes: number
  notifyGoal: boolean
  notifyPreEnd: boolean
  preEndMinutes: PreEndMinutes
  notifyMilestones: boolean
  reminderEnabled: boolean
  /** Hora local 'HH:MM' del recordatorio diario. */
  reminderTime: string
  weightGoalKg: number | null
}

export type MeDto = { user: UserDto; settings: SettingsDto }

export type FastDto = {
  id: number
  startedAt: number
  endedAt: number | null
  goalMinutes: number
  plan: PlanId
  note: string | null
}

export type ActiveFastDto = { active: FastDto | null; lastEndedAt: number | null }

/** Página del historial (solo ayunos terminados, del más reciente al más antiguo). */
export type FastPageDto = { items: FastDto[]; nextBefore: number | null }

export type { StatsDto } from './stats'

/** Códigos de error que devuelve la API en `{ error }`. */
export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden_origin'
  | 'rate_limited'
  | 'validation_error'
  | 'invalid_credentials'
  | 'invalid_invite'
  | 'email_taken'
  | 'not_found'
  | 'fast_already_active'
  | 'fast_not_active'
  | 'fast_overlap'
  | 'fast_too_long'
  | 'invalid_time_range'
