import { useState } from 'react'
import type { FastDto, StatsDto } from '../../shared/api'
import { goalMinutesFor, PLANS } from '../../shared/plans'
import { FastEditor } from '../components/FastEditor'
import { Button, Card, ErrorText } from '../components/ui'
import { WeekChart } from '../components/WeekChart'
import { errorMessage } from '../lib/api'
import { capitalizeFirst, formatClock, formatDuration, formatGoal } from '../lib/format'
import { useFastHistory, useFastStats, useSession } from '../lib/queries'
import { useNow } from '../lib/useNow'

const MINUTE = 60_000
const dayFmt = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

export function HistoryScreen() {
  const { settings } = useSession()
  const stats = useFastStats()
  const history = useFastHistory()
  // Basta con refrescar cada minuto: solo se usa como «ahora» al editar.
  const now = useNow(60_000)
  const [editing, setEditing] = useState<FastDto | null>(null)
  const [adding, setAdding] = useState(false)
  const defaultGoal = goalMinutesFor(settings.defaultPlan, settings.customGoalMinutes)

  const fasts = history.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Historial</h1>
        <Button variant="ghost" className="min-h-10 px-4 py-1.5" onClick={() => setAdding(true)}>
          + Añadir
        </Button>
      </div>

      {stats.data && <StatsCards stats={stats.data} />}
      {stats.data && (
        <Card>
          <WeekChart days={stats.data.last7Days} goalMinutes={defaultGoal} />
        </Card>
      )}
      <ErrorText>{stats.error ? errorMessage(stats.error) : undefined}</ErrorText>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-bold">Tus ayunos</h2>
        {history.isPending && <p className="py-6 text-center opacity-60">Cargando…</p>}
        <ErrorText>{history.error ? errorMessage(history.error) : undefined}</ErrorText>
        {history.data && fasts.length === 0 && (
          <Card className="py-8 text-center">
            <p className="font-semibold">Aún no hay ayunos terminados</p>
            <p className="text-sm text-ink/60 dark:text-brand-50/60">
              Aquí aparecerán cuando completes el primero. Si se te olvidó registrar alguno, pulsa
              «+ Añadir».
            </p>
          </Card>
        )}
        <ul className="flex flex-col gap-2">
          {fasts.map((f) => (
            <li key={f.id}>
              <FastRow fast={f} onClick={() => setEditing(f)} />
            </li>
          ))}
        </ul>
        {history.hasNextPage && (
          <Button
            variant="secondary"
            onClick={() => history.fetchNextPage()}
            busy={history.isFetchingNextPage}
          >
            Ver más
          </Button>
        )}
      </section>

      <FastEditor
        open={adding || editing !== null}
        fast={editing}
        now={now}
        defaultGoalMinutes={defaultGoal}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
      />
    </div>
  )
}

function StatsCards({ stats }: { stats: StatsDto }) {
  const items = [
    {
      label: 'Racha actual',
      value: `${stats.currentStreak} ${stats.currentStreak === 1 ? 'día' : 'días'}`,
      icon: '🔥',
    },
    {
      label: 'Mejor racha',
      value: `${stats.bestStreak} ${stats.bestStreak === 1 ? 'día' : 'días'}`,
      icon: '🏆',
    },
    {
      label: 'Media 7 días',
      value: stats.avg7Minutes !== null ? formatDuration(stats.avg7Minutes * MINUTE) : '—',
      icon: '⏱️',
    },
    {
      label: 'Objetivos (30 días)',
      value: stats.goalRate30 !== null ? `${stats.goalRate30} %` : '—',
      icon: '🎯',
    },
  ]
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        {items.map((it) => (
          <Card key={it.label} className="p-4!">
            <p className="text-xs font-medium text-ink/60 dark:text-brand-50/60">
              <span aria-hidden>{it.icon}</span> {it.label}
            </p>
            <p className="text-xl font-extrabold tabular-nums">{it.value}</p>
          </Card>
        ))}
      </div>
      {stats.totalFasts > 0 && (
        <p className="px-1 text-center text-xs text-ink/60 dark:text-brand-50/60">
          {stats.totalFasts} {stats.totalFasts === 1 ? 'ayuno' : 'ayunos'} ·{' '}
          {Math.round(stats.totalMinutes / 60)} h en total · el más largo,{' '}
          {formatDuration(stats.longestMinutes * MINUTE)}
        </p>
      )}
    </div>
  )
}

function FastRow({ fast, onClick }: { fast: FastDto; onClick: () => void }) {
  const end = fast.endedAt!
  const duration = end - fast.startedAt
  const met = duration >= fast.goalMinutes * MINUTE
  const plan = fast.plan === 'custom' ? formatGoal(fast.goalMinutes) : PLANS[fast.plan].label
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-left shadow-sm active:bg-brand-100 dark:bg-white/5 dark:active:bg-white/10"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
          met
            ? 'bg-brand-700 text-white dark:bg-brand-300 dark:text-ink'
            : 'bg-brand-100 text-brand-700 dark:bg-white/10 dark:text-brand-200'
        }`}
        aria-label={met ? 'Objetivo cumplido' : 'Objetivo no cumplido'}
      >
        {met ? '✓' : '–'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-ink/60 dark:text-brand-50/60">
          {capitalizeFirst(dayFmt.format(end))} · {formatClock(fast.startedAt)} → {formatClock(end)}
        </span>
        <span className="block font-bold">
          {formatDuration(duration)}{' '}
          <span className="font-medium text-ink/60 dark:text-brand-50/60">de {plan}</span>
        </span>
        {fast.note && (
          <span className="block truncate text-sm text-ink/70 dark:text-brand-50/70">
            {fast.note}
          </span>
        )}
      </span>
      <span aria-hidden className="text-ink/30 dark:text-brand-50/30">
        ›
      </span>
    </button>
  )
}
