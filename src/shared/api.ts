import { z } from 'zod'
import { GOAL_LIMITS, isValidGoalMinutes, PLAN_IDS, type PlanId } from './plans'

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

export const updateFastSchema = z
  .object({
    startedAt: epochMs,
    plan: planIdSchema,
    goalMinutes,
    note: z.string().trim().max(500).nullable(),
  })
  .partial()
export type UpdateFastInput = z.infer<typeof updateFastSchema>

// ---- Respuestas ----

export type UserDto = { id: number; email: string; name: string; timezone: string }

export type SettingsDto = {
  defaultPlan: PlanId
  customGoalMinutes: number
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
  | 'overlaps_previous'
  | 'invalid_time_range'
