import { useState } from 'react'
import { MAX_FAST_MS, type FastDto } from '../../shared/api'
import { GOAL_LIMITS, goalMinutesFor, PLAN_IDS, PLANS, type PlanId } from '../../shared/plans'
import { errorMessage } from '../lib/api'
import { formatDuration, fromDateTimeLocal, toDateTimeLocal } from '../lib/format'
import { useAddManualFast, useDeleteFast, useUpdateFast } from '../lib/queries'
import { Button, ErrorText, Sheet } from './ui'

const MINUTE = 60_000
const inputClass =
  'min-h-12 w-full rounded-2xl border border-brand-200 bg-white px-4 text-base text-ink dark:border-white/10 dark:bg-white/10 dark:text-brand-50'

/**
 * Hoja para editar un ayuno terminado o añadir uno pasado a mano.
 * `fast = null` es el modo «añadir». `now` llega de fuera porque el render debe ser puro.
 */
export function FastEditor({
  open,
  fast,
  now,
  defaultGoalMinutes,
  onClose,
}: {
  open: boolean
  fast: FastDto | null
  now: number
  defaultGoalMinutes: number
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={fast ? 'Editar ayuno' : 'Añadir ayuno'}>
      {/* Se monta al abrir, así el formulario empieza de cero cada vez. */}
      {open && (
        <EditorForm
          fast={fast}
          now={now}
          defaultGoalMinutes={defaultGoalMinutes}
          onDone={onClose}
        />
      )}
    </Sheet>
  )
}

function EditorForm({
  fast,
  now,
  defaultGoalMinutes,
  onDone,
}: {
  fast: FastDto | null
  now: number
  defaultGoalMinutes: number
  onDone: () => void
}) {
  const update = useUpdateFast()
  const add = useAddManualFast()
  const remove = useDeleteFast()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const initialEnd = fast?.endedAt ?? now - (now % (15 * MINUTE))
  const initialGoal = fast?.goalMinutes ?? defaultGoalMinutes
  const [start, setStart] = useState(() =>
    toDateTimeLocal(fast?.startedAt ?? initialEnd - initialGoal * MINUTE),
  )
  const [end, setEnd] = useState(() => toDateTimeLocal(initialEnd))
  const [plan, setPlan] = useState<PlanId>(fast?.plan ?? 'custom')
  const [customHours, setCustomHours] = useState(String(initialGoal / 60))
  const [note, setNote] = useState(fast?.note ?? '')

  const startMs = start ? fromDateTimeLocal(start) : NaN
  const endMs = end ? fromDateTimeLocal(end) : NaN
  const customMinutes = Math.round((Number(customHours.replace(',', '.')) * 60) / 15) * 15
  const goalMinutes = goalMinutesFor(plan, customMinutes)

  const problem =
    Number.isNaN(startMs) || Number.isNaN(endMs)
      ? 'Indica el inicio y el fin.'
      : endMs <= startMs
        ? 'El fin tiene que ser posterior al inicio.'
        : endMs > now
          ? 'El fin no puede ser en el futuro.'
          : endMs - startMs > MAX_FAST_MS
            ? 'Un ayuno no puede durar más de 7 días.'
            : plan === 'custom' &&
                (customMinutes < GOAL_LIMITS.min || customMinutes > GOAL_LIMITS.max)
              ? 'El objetivo debe estar entre 1 y 72 h.'
              : null

  const duration = problem ? null : endMs - startMs
  const mutation = fast ? update : add
  const busy = mutation.isPending || remove.isPending
  const error = mutation.error ?? remove.error

  const save = () => {
    if (problem) return
    const body = {
      startedAt: startMs,
      endedAt: endMs,
      plan,
      goalMinutes,
      note: note.trim() || null,
    }
    if (fast) update.mutate({ id: fast.id, ...body }, { onSuccess: onDone })
    else add.mutate(body, { onSuccess: onDone })
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Inicio (última comida)
        <input
          type="datetime-local"
          value={start}
          max={toDateTimeLocal(now)}
          onChange={(e) => setStart(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Fin
        <input
          type="datetime-local"
          value={end}
          max={toDateTimeLocal(now)}
          onChange={(e) => setEnd(e.target.value)}
          className={inputClass}
        />
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
          Objetivo
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as PlanId)}
            className={inputClass}
          >
            {PLAN_IDS.map((id) => (
              <option key={id} value={id}>
                {id === 'custom'
                  ? 'Personalizado'
                  : `${PLANS[id].label} · ${PLANS[id].fastingHours} h`}
              </option>
            ))}
          </select>
        </label>
        {plan === 'custom' && (
          <label className="flex w-28 flex-col gap-1.5 text-sm font-medium">
            Horas
            <input
              type="number"
              inputMode="decimal"
              min={1}
              max={72}
              step={0.25}
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nota (opcional)
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          placeholder="¿Cómo te has sentido?"
          onChange={(e) => setNote(e.target.value)}
          className={`${inputClass} py-3`}
        />
      </label>

      {duration !== null && (
        <p className="text-center text-sm">
          Duración: <strong>{formatDuration(duration)}</strong>
          {duration >= goalMinutes * MINUTE ? ' · objetivo cumplido ✓' : ''}
        </p>
      )}
      <ErrorText>{problem && (start || end) ? problem : undefined}</ErrorText>
      <ErrorText>{error ? errorMessage(error) : undefined}</ErrorText>

      <Button type="submit" busy={mutation.isPending} disabled={Boolean(problem) || busy}>
        {fast ? 'Guardar cambios' : 'Añadir ayuno'}
      </Button>
      {fast && (
        <Button
          variant={confirmDelete ? 'danger' : 'ghost'}
          busy={remove.isPending}
          disabled={busy}
          onClick={() =>
            confirmDelete ? remove.mutate(fast.id, { onSuccess: onDone }) : setConfirmDelete(true)
          }
        >
          {confirmDelete ? 'Toca otra vez para borrarlo' : 'Borrar ayuno'}
        </Button>
      )}
    </form>
  )
}
