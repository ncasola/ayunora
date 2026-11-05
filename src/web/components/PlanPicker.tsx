import { GOAL_LIMITS, goalMinutesFor, PLAN_IDS, PLANS, type PlanId } from '../../shared/plans'
import { formatGoal } from '../lib/format'

export type PlanChoice = { plan: PlanId; customGoalMinutes: number }

/** Lista de planes con selector de horas para el personalizado. */
export function PlanPicker({
  value,
  onChange,
}: {
  value: PlanChoice
  onChange: (v: PlanChoice) => void
}) {
  const step = (delta: number) => {
    const next = Math.min(
      GOAL_LIMITS.max,
      Math.max(GOAL_LIMITS.min, value.customGoalMinutes + delta),
    )
    onChange({ plan: 'custom', customGoalMinutes: next })
  }

  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Plan de ayuno">
      {PLAN_IDS.map((id) => {
        const plan = PLANS[id]
        const selected = value.plan === id
        return (
          <div
            key={id}
            className={`rounded-2xl border-2 transition ${
              selected
                ? 'border-brand-500 bg-white dark:bg-white/10'
                : 'border-transparent bg-white/60 dark:bg-white/5'
            }`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ ...value, plan: id })}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <span className="w-16 shrink-0 text-xl font-extrabold text-brand-600 dark:text-brand-300">
                {id === 'custom' ? '⚙︎' : plan.label}
              </span>
              <span className="flex-1">
                <span className="block font-semibold">
                  {id === 'custom'
                    ? `Personalizado · ${formatGoal(value.customGoalMinutes)}`
                    : `${formatGoal(goalMinutesFor(id, 0))} de ayuno`}
                </span>
                <span className="block text-sm text-ink/60 dark:text-brand-50/60">
                  {plan.description}
                </span>
              </span>
            </button>
            {id === 'custom' && selected && (
              <div className="flex items-center justify-center gap-4 px-4 pb-4">
                <StepButton label="Quitar 15 minutos" onClick={() => step(-GOAL_LIMITS.step)}>
                  −
                </StepButton>
                <span className="min-w-28 text-center text-2xl font-bold tabular-nums">
                  {formatGoal(value.customGoalMinutes)}
                </span>
                <StepButton label="Añadir 15 minutos" onClick={() => step(GOAL_LIMITS.step)}>
                  +
                </StepButton>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="size-12 rounded-full bg-brand-100 text-2xl font-bold text-brand-700 active:bg-brand-200 dark:bg-white/10 dark:text-brand-200"
    >
      {children}
    </button>
  )
}
