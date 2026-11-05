import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { FastDto, SettingsDto } from '../../shared/api'
import { PHASES, phaseAt, type PhaseState } from '../../shared/phases'
import { goalMinutesFor, PLANS } from '../../shared/plans'
import { DateTimeSheet } from '../components/DateTimeSheet'
import { PlanPicker, type PlanChoice } from '../components/PlanPicker'
import { ProgressRing } from '../components/ProgressRing'
import { Button, Card, ErrorText, Sheet } from '../components/ui'
import { errorMessage } from '../lib/api'
import { formatDayClock, formatDuration, formatGoal, formatHms } from '../lib/format'
import { useActiveFast, useSession, useStartFast, useStopFast, useUpdateFast } from '../lib/queries'
import { useNow } from '../lib/useNow'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const MAX_BACKDATE = 72 * HOUR

function planLabel(choice: PlanChoice) {
  return choice.plan === 'custom' ? formatGoal(choice.customGoalMinutes) : PLANS[choice.plan].label
}

/** Restante redondeado al minuto hacia arriba: en el último minuto pone «1 min» y no «0 min». */
const ceilToMinute = (ms: number) => Math.ceil(ms / MINUTE) * MINUTE

export function TimerScreen() {
  const { settings } = useSession()
  const { data, error, isPending } = useActiveFast()
  const now = useNow()
  const [finished, setFinished] = useState<FastDto | null>(null)

  if (isPending) return <p className="py-20 text-center opacity-60">Cargando…</p>
  if (!data) return <ErrorText>{errorMessage(error)}</ErrorText>

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-extrabold">{data.active ? 'Ayunando' : 'Tu próximo ayuno'}</h1>
      {data.active ? (
        <ActiveFast
          key={data.active.id}
          fast={data.active}
          lastEndedAt={data.lastEndedAt}
          now={now}
          onStopped={setFinished}
        />
      ) : (
        <IdleFast settings={settings} lastEndedAt={data.lastEndedAt} now={now} />
      )}
      <FinishedSheet fast={finished} onClose={() => setFinished(null)} />
    </div>
  )
}

// ---- Sin ayuno en curso ----

function IdleFast({
  settings,
  lastEndedAt,
  now,
}: {
  settings: SettingsDto
  lastEndedAt: number | null
  now: number
}) {
  const [choice, setChoice] = useState<PlanChoice>({
    plan: settings.defaultPlan,
    customGoalMinutes: settings.customGoalMinutes,
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [backdateOpen, setBackdateOpen] = useState(false)
  const start = useStartFast()
  const goalMinutes = goalMinutesFor(choice.plan, choice.customGoalMinutes)

  const begin = (startedAt?: number) =>
    start.mutate(
      { plan: choice.plan, goalMinutes, startedAt },
      { onSuccess: () => setBackdateOpen(false) },
    )

  const minStart = Math.max(lastEndedAt ?? 0, now - MAX_BACKDATE)

  return (
    <>
      <ProgressRing progress={0}>
        <p className="text-sm font-medium text-ink/60 dark:text-brand-50/60">Listo para ayunar</p>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-1 rounded-full px-4 py-1 text-5xl font-extrabold text-brand-600 active:bg-brand-100 dark:text-brand-300 dark:active:bg-white/5"
        >
          {planLabel(choice)}
          <span className="ml-1 align-middle text-xl">▾</span>
        </button>
        <p className="text-sm text-ink/60 dark:text-brand-50/60">
          {formatGoal(goalMinutes)} de ayuno
        </p>
      </ProgressRing>

      {lastEndedAt && (
        <p className="text-center text-sm text-ink/70 dark:text-brand-50/70">
          🍽️ Comiendo desde hace <strong>{formatDuration(now - lastEndedAt)}</strong>
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button onClick={() => begin()} busy={start.isPending && !backdateOpen}>
          Empezar ayuno
        </Button>
        <Button variant="ghost" onClick={() => setBackdateOpen(true)}>
          Empecé antes…
        </Button>
        <ErrorText>
          {start.error && !backdateOpen ? errorMessage(start.error) : undefined}
        </ErrorText>
      </div>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Elige tu plan">
        <PlanPicker value={choice} onChange={setChoice} />
        <Button className="mt-4 w-full" onClick={() => setPickerOpen(false)}>
          Listo
        </Button>
      </Sheet>

      <DateTimeSheet
        open={backdateOpen}
        onClose={() => {
          setBackdateOpen(false)
          start.reset()
        }}
        title="¿Cuándo empezaste?"
        description="Elige la hora de tu última comida."
        initial={Math.max(now - HOUR, minStart)}
        min={minStart}
        max={now}
        confirmLabel="Empezar ayuno"
        busy={start.isPending}
        error={start.error ? errorMessage(start.error) : undefined}
        onConfirm={(ms) => begin(ms)}
      />
    </>
  )
}

// ---- Ayuno en curso ----

function ActiveFast({
  fast,
  lastEndedAt,
  now,
  onStopped,
}: {
  fast: FastDto
  lastEndedAt: number | null
  now: number
  onStopped: (f: FastDto) => void
}) {
  const stop = useStopFast()
  const update = useUpdateFast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editStartOpen, setEditStartOpen] = useState(false)
  const [editPlanOpen, setEditPlanOpen] = useState(false)
  const [choice, setChoice] = useState<PlanChoice>({
    plan: fast.plan,
    customGoalMinutes: fast.goalMinutes,
  })

  const goalMs = fast.goalMinutes * MINUTE
  const elapsed = Math.max(0, now - fast.startedAt)
  const remaining = goalMs - elapsed
  const progress = elapsed / goalMs
  const phase = phaseAt(elapsed)
  const marks = PHASES.slice(1).map((p) => (p.startHour * HOUR) / goalMs)

  const doStop = () =>
    stop.mutate(
      { id: fast.id },
      {
        onSuccess: (f) => {
          setConfirmOpen(false)
          onStopped(f)
        },
      },
    )

  const savePlan = () => {
    const goalMinutes = goalMinutesFor(choice.plan, choice.customGoalMinutes)
    update.mutate(
      { id: fast.id, plan: choice.plan, goalMinutes },
      { onSuccess: () => setEditPlanOpen(false) },
    )
  }

  return (
    <>
      <ProgressRing progress={progress} marks={marks}>
        <p className="text-sm font-medium text-ink/60 dark:text-brand-50/60">
          {remaining > 0 ? 'Llevas' : '¡Objetivo cumplido! 🎉'}
        </p>
        <p className="text-5xl font-extrabold tabular-nums tracking-tight">{formatHms(elapsed)}</p>
        <button
          type="button"
          onClick={() => setEditPlanOpen(true)}
          className="mt-1 rounded-full px-3 py-1 text-sm font-semibold text-brand-600 active:bg-brand-100 dark:text-brand-300 dark:active:bg-white/5"
        >
          {planLabel({ plan: fast.plan, customGoalMinutes: fast.goalMinutes })} ·{' '}
          {Math.floor(progress * 100)}% ✎
        </button>
      </ProgressRing>

      <p className="text-center font-semibold">
        {remaining > 0
          ? `Te quedan ${formatDuration(ceilToMinute(remaining))}`
          : `Llevas ${formatDuration(-remaining)} extra`}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setEditStartOpen(true)}
          className="rounded-3xl bg-white p-4 text-left shadow-sm active:bg-brand-100 dark:bg-white/5 dark:active:bg-white/10"
        >
          <span className="block text-xs font-medium text-ink/60 dark:text-brand-50/60">
            Inicio ✎
          </span>
          <span className="block font-bold">{formatDayClock(fast.startedAt, now)}</span>
        </button>
        <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-white/5">
          <span className="block text-xs font-medium text-ink/60 dark:text-brand-50/60">
            Objetivo
          </span>
          <span className="block font-bold">{formatDayClock(fast.startedAt + goalMs, now)}</span>
        </div>
      </div>

      <PhaseCard state={phase} />

      <Button
        variant={remaining > 0 ? 'secondary' : 'primary'}
        busy={stop.isPending && !confirmOpen}
        onClick={() => (remaining > 0 ? setConfirmOpen(true) : doStop())}
      >
        Terminar ayuno
      </Button>
      <ErrorText>{stop.error && !confirmOpen ? errorMessage(stop.error) : undefined}</ErrorText>

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="¿Terminar ya?">
        <p className="mb-5">
          Aún te quedan <strong>{formatDuration(ceilToMinute(remaining))}</strong> para tu objetivo.
          Puedes terminar igualmente: el ayuno se guarda tal cual.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => setConfirmOpen(false)}>Seguir ayunando 💪</Button>
          <Button variant="ghost" onClick={doStop} busy={stop.isPending}>
            Terminar ahora
          </Button>
          <ErrorText>{stop.error ? errorMessage(stop.error) : undefined}</ErrorText>
        </div>
      </Sheet>

      <DateTimeSheet
        open={editStartOpen}
        onClose={() => {
          setEditStartOpen(false)
          update.reset()
        }}
        title="Hora de inicio"
        description="¿Cuándo fue tu última comida?"
        initial={fast.startedAt}
        min={lastEndedAt ?? undefined}
        max={now}
        confirmLabel="Guardar"
        busy={update.isPending}
        error={update.error ? errorMessage(update.error) : undefined}
        onConfirm={(ms) =>
          update.mutate(
            { id: fast.id, startedAt: ms },
            { onSuccess: () => setEditStartOpen(false) },
          )
        }
      />

      <Sheet
        open={editPlanOpen}
        onClose={() => {
          setEditPlanOpen(false)
          update.reset()
        }}
        title="Cambiar objetivo"
      >
        <PlanPicker value={choice} onChange={setChoice} />
        <Button className="mt-4 w-full" onClick={savePlan} busy={update.isPending}>
          Guardar
        </Button>
        <ErrorText>{update.error ? errorMessage(update.error) : undefined}</ErrorText>
      </Sheet>
    </>
  )
}

function PhaseCard({ state }: { state: PhaseState }) {
  const { phase, index, next, msToNext } = state
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="text-4xl" aria-hidden>
          {phase.emoji}
        </span>
        <div className="flex-1">
          <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase dark:text-brand-300">
            Fase {index + 1} de {PHASES.length}
          </p>
          <h2 className="text-lg font-bold">{phase.name}</h2>
          <p className="text-sm text-ink/70 dark:text-brand-50/70">{phase.description}</p>
        </div>
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {PHASES.map((p, i) => (
          <span
            key={p.id}
            className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-brand-500' : 'bg-brand-100 dark:bg-white/10'}`}
          />
        ))}
      </div>
      {next && msToNext !== null && (
        <p className="text-sm">
          Siguiente: {next.emoji} <strong>{next.name}</strong> en{' '}
          {formatDuration(ceilToMinute(msToNext))}
        </p>
      )}
      <p className="text-[11px] text-ink/45 dark:text-brand-50/45">
        Información orientativa: cada cuerpo es distinto y no sustituye al consejo médico.
      </p>
    </Card>
  )
}

function FinishedSheet({ fast, onClose }: { fast: FastDto | null; onClose: () => void }) {
  const duration = fast?.endedAt ? fast.endedAt - fast.startedAt : 0
  const goalMinutes = fast?.goalMinutes ?? 0
  const achieved = duration >= goalMinutes * MINUTE
  const navigate = useNavigate()
  return (
    <Sheet
      open={Boolean(fast?.endedAt)}
      onClose={onClose}
      title={achieved ? '¡Objetivo cumplido! 🎉' : 'Ayuno terminado'}
    >
      <div className="flex flex-col items-center gap-2 pb-4 text-center">
        <p className="text-5xl font-extrabold tabular-nums">{formatDuration(duration)}</p>
        <p className="text-sm text-ink/60 dark:text-brand-50/60">
          Objetivo: {formatGoal(goalMinutes)}
        </p>
        <p className="mt-2">
          {achieved
            ? '¡Enhorabuena! Has completado tu ayuno. Disfruta de tu comida.'
            : 'Cada ayuno cuenta. ¡El próximo saldrá aún mejor!'}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button className="w-full" onClick={onClose}>
          Cerrar
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            onClose()
            void navigate('/peso')
          }}
        >
          ⚖️ Apuntar el peso de hoy
        </Button>
      </div>
    </Sheet>
  )
}
