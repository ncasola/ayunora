export const PLAN_IDS = ['16:8', '18:6', '20:4', 'omad', 'custom'] as const
export type PlanId = (typeof PLAN_IDS)[number]

export type Plan = {
  id: PlanId
  label: string
  /** Horas de ayuno. `null` en el plan personalizado. */
  fastingHours: number | null
  description: string
}

export const PLANS: Record<PlanId, Plan> = {
  '16:8': {
    id: '16:8',
    label: '16:8',
    fastingHours: 16,
    description: '16 h de ayuno y 8 h para comer. El más popular para empezar.',
  },
  '18:6': {
    id: '18:6',
    label: '18:6',
    fastingHours: 18,
    description: '18 h de ayuno y 6 h para comer.',
  },
  '20:4': {
    id: '20:4',
    label: '20:4',
    fastingHours: 20,
    description: '20 h de ayuno y 4 h para comer.',
  },
  omad: {
    id: 'omad',
    label: 'OMAD',
    fastingHours: 23,
    description: 'Una comida al día: 23 h de ayuno y 1 h para comer.',
  },
  custom: {
    id: 'custom',
    label: 'Personalizado',
    fastingHours: null,
    description: 'Tú eliges las horas.',
  },
}

/** Límites del objetivo, en minutos (de 1 h a 72 h, en saltos de 15 min). */
export const GOAL_LIMITS = { min: 60, max: 72 * 60, step: 15 } as const

export function isValidGoalMinutes(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= GOAL_LIMITS.min &&
    minutes <= GOAL_LIMITS.max &&
    minutes % GOAL_LIMITS.step === 0
  )
}

/** Objetivo en minutos de un plan. Para `custom` se usa el valor guardado por el usuario. */
export function goalMinutesFor(plan: PlanId, customGoalMinutes: number): number {
  const hours = PLANS[plan].fastingHours
  return hours === null ? customGoalMinutes : hours * 60
}
