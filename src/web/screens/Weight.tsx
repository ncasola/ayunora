import { useState } from 'react'
import {
  addDays,
  parseKg,
  summarizeWeights,
  WEIGHT_LIMITS,
  type WeightDto,
} from '../../shared/weights'
import { Button, Card, ErrorText, Sheet } from '../components/ui'
import { WeightChart } from '../components/WeightChart'
import { errorMessage } from '../lib/api'
import { capitalizeFirst, formatKg, todayLocal } from '../lib/format'
import {
  useDeleteWeight,
  usePutWeight,
  useSession,
  useUpdateSettings,
  useWeights,
} from '../lib/queries'
import { useNow } from '../lib/useNow'

const RANGES = [
  { id: '30', label: '30 días', days: 30 },
  { id: '90', label: '90 días', days: 90 },
  { id: 'all', label: 'Todo', days: null },
] as const
type RangeId = (typeof RANGES)[number]['id']
/** Registros visibles en la lista antes de «Ver todos». */
const RECENT_COUNT = 10

const dayFmt = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const kgInputClass =
  'min-h-12 w-full rounded-2xl border border-brand-200 bg-white px-4 text-base text-ink dark:border-white/10 dark:bg-white/10 dark:text-brand-50'

const kgToInput = (kg: number) => String(kg).replace('.', ',')

export function WeightScreen() {
  const { settings } = useSession()
  const weights = useWeights()
  const now = useNow(60_000)
  const today = todayLocal(now)
  const [range, setRange] = useState<RangeId>('30')
  const [editing, setEditing] = useState<WeightDto | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  // Sin useMemo: el React Compiler ya memoiza estos cálculos.
  const entries = weights.data ?? []
  const summary = summarizeWeights(entries, today, settings.weightGoalKg)
  const newestFirst = [...entries].reverse()
  const rangeDays = RANGES.find((r) => r.id === range)!.days
  const visible =
    rangeDays === null ? entries : entries.filter((e) => e.day > addDays(today, -rangeDays))

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-extrabold">Peso</h1>

      <QuickEntry today={today} entries={entries} />

      {weights.isPending && <p className="py-6 text-center opacity-60">Cargando…</p>}
      <ErrorText>{weights.error ? errorMessage(weights.error) : undefined}</ErrorText>

      {summary.current && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Actual" value={formatKg(summary.current.kg)} />
          <Stat
            label="Desde el inicio"
            value={summary.changeTotal !== null ? formatKg(summary.changeTotal, true) : '—'}
          />
          <Stat
            label="Últimos 30 días"
            value={summary.change30 !== null ? formatKg(summary.change30, true) : '—'}
          />
          <button
            type="button"
            onClick={() => setGoalOpen(true)}
            className="rounded-3xl bg-white p-4 text-left shadow-sm active:bg-brand-100 dark:bg-white/5 dark:active:bg-white/10"
          >
            <p className="text-xs font-medium text-ink/60 dark:text-brand-50/60">🎯 Objetivo ✎</p>
            <p className="text-xl font-extrabold tabular-nums">
              {settings.weightGoalKg !== null ? formatKg(settings.weightGoalKg) : 'Fijar'}
            </p>
            {summary.toGoal !== null && (
              <p className="text-xs text-ink/60 dark:text-brand-50/60">
                {summary.toGoal === 0
                  ? '¡Conseguido!'
                  : `Faltan ${formatKg(Math.abs(summary.toGoal))}`}
              </p>
            )}
          </button>
        </div>
      )}

      {entries.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex gap-2" role="radiogroup" aria-label="Periodo del gráfico">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={range === r.id}
                onClick={() => setRange(r.id)}
                className={`min-h-9 flex-1 rounded-full text-sm font-semibold transition ${
                  range === r.id
                    ? 'bg-brand-500 text-white'
                    : 'bg-brand-100 text-brand-700 dark:bg-white/10 dark:text-brand-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {visible.length > 0 ? (
            <WeightChart entries={visible} goalKg={settings.weightGoalKg} />
          ) : (
            <p className="py-6 text-center text-sm opacity-60">Sin registros en este periodo.</p>
          )}
        </Card>
      )}

      {weights.data && entries.length === 0 && (
        <Card className="py-8 text-center">
          <p className="font-semibold">Aún no hay registros</p>
          <p className="text-sm text-ink/60 dark:text-brand-50/60">
            Apunta tu peso arriba. Lo ideal es pesarse a la misma hora, por ejemplo al levantarse.
          </p>
        </Card>
      )}

      {entries.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 font-bold">Registros</h2>
          <ul className="flex flex-col gap-2">
            {newestFirst.slice(0, showAll ? undefined : RECENT_COUNT).map((w, i) => {
              const prev = newestFirst[i + 1]
              const delta = prev ? Math.round((w.kg - prev.kg) * 10) / 10 : null
              return (
                <li key={w.day}>
                  <button
                    type="button"
                    onClick={() => setEditing(w)}
                    className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-left shadow-sm active:bg-brand-100 dark:bg-white/5 dark:active:bg-white/10"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink/60 dark:text-brand-50/60">
                        {capitalizeFirst(dayFmt.format(new Date(`${w.day}T00:00:00Z`)))}
                      </span>
                      <span className="block font-bold tabular-nums">{formatKg(w.kg)}</span>
                      {w.note && (
                        <span className="block truncate text-sm text-ink/70 dark:text-brand-50/70">
                          {w.note}
                        </span>
                      )}
                    </span>
                    {delta !== null && (
                      <span className="text-sm text-ink/60 tabular-nums dark:text-brand-50/60">
                        {formatKg(delta, true)}
                      </span>
                    )}
                    <span aria-hidden className="text-ink/30 dark:text-brand-50/30">
                      ›
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {!showAll && newestFirst.length > RECENT_COUNT && (
            <Button variant="secondary" onClick={() => setShowAll(true)}>
              Ver todos ({newestFirst.length})
            </Button>
          )}
        </section>
      )}

      <EditWeightSheet entry={editing} onClose={() => setEditing(null)} />
      <GoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4!">
      <p className="text-xs font-medium text-ink/60 dark:text-brand-50/60">{label}</p>
      <p className="text-xl font-extrabold tabular-nums">{value}</p>
    </Card>
  )
}

function QuickEntry({ today, entries }: { today: string; entries: WeightDto[] }) {
  const put = usePutWeight()
  const [day, setDay] = useState(today)
  const [kg, setKg] = useState('')
  const [saved, setSaved] = useState(false)
  const existing = entries.find((e) => e.day === day)
  const value = parseKg(kg)
  const invalid = value === null || value < WEIGHT_LIMITS.min || value > WEIGHT_LIMITS.max

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-bold">Apuntar peso</h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (invalid) return
          put.mutate(
            { day, kg: value },
            {
              onSuccess: () => {
                setKg('')
                setSaved(true)
              },
            },
          )
        }}
      >
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
            Día
            <input
              type="date"
              value={day}
              max={today}
              onChange={(e) => {
                setDay(e.target.value || today)
                setSaved(false)
              }}
              className={kgInputClass}
            />
          </label>
          <label className="flex w-32 flex-col gap-1.5 text-sm font-medium">
            Peso (kg)
            <input
              type="text"
              inputMode="decimal"
              placeholder={existing ? kgToInput(existing.kg) : '64,5'}
              value={kg}
              onChange={(e) => {
                setKg(e.target.value)
                setSaved(false)
              }}
              className={`${kgInputClass} text-lg font-bold tabular-nums`}
            />
          </label>
        </div>
        {existing && !saved && (
          <p className="text-xs text-ink/60 dark:text-brand-50/60">
            Ese día ya tienes {formatKg(existing.kg)}: se sustituirá.
          </p>
        )}
        {kg && invalid && (
          <ErrorText>
            Escribe un peso entre {WEIGHT_LIMITS.min} y {WEIGHT_LIMITS.max} kg.
          </ErrorText>
        )}
        <ErrorText>{put.error ? errorMessage(put.error) : undefined}</ErrorText>
        <Button type="submit" busy={put.isPending} disabled={invalid}>
          {saved ? 'Guardado ✓' : 'Guardar'}
        </Button>
      </form>
    </Card>
  )
}

function EditWeightSheet({ entry, onClose }: { entry: WeightDto | null; onClose: () => void }) {
  return (
    <Sheet
      open={entry !== null}
      onClose={onClose}
      title={
        entry
          ? capitalizeFirst(dayFmt.format(new Date(`${entry.day}T00:00:00Z`)))
          : 'Editar registro'
      }
    >
      {entry && <EditWeightForm key={entry.day} entry={entry} onDone={onClose} />}
    </Sheet>
  )
}

function EditWeightForm({ entry, onDone }: { entry: WeightDto; onDone: () => void }) {
  const put = usePutWeight()
  const remove = useDeleteWeight()
  const [kg, setKg] = useState(kgToInput(entry.kg))
  const [note, setNote] = useState(entry.note ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const value = parseKg(kg)
  const invalid = value === null || value < WEIGHT_LIMITS.min || value > WEIGHT_LIMITS.max
  const error = put.error ?? remove.error

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!invalid) put.mutate({ day: entry.day, kg: value, note }, { onSuccess: onDone })
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Peso (kg)
        <input
          type="text"
          inputMode="decimal"
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          className={`${kgInputClass} text-lg font-bold tabular-nums`}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nota (opcional)
        <input
          type="text"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={kgInputClass}
        />
      </label>
      <ErrorText>{error ? errorMessage(error) : undefined}</ErrorText>
      <Button type="submit" busy={put.isPending} disabled={invalid}>
        Guardar
      </Button>
      <Button
        variant={confirmDelete ? 'danger' : 'ghost'}
        busy={remove.isPending}
        onClick={() =>
          confirmDelete ? remove.mutate(entry.day, { onSuccess: onDone }) : setConfirmDelete(true)
        }
      >
        {confirmDelete ? 'Toca otra vez para borrarlo' : 'Borrar registro'}
      </Button>
    </form>
  )
}

function GoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Peso objetivo">
      {open && <GoalForm onDone={onClose} />}
    </Sheet>
  )
}

function GoalForm({ onDone }: { onDone: () => void }) {
  const { settings } = useSession()
  const update = useUpdateSettings()
  const [kg, setKg] = useState(
    settings.weightGoalKg !== null ? kgToInput(settings.weightGoalKg) : '',
  )
  const value = parseKg(kg)
  const invalid = value === null || value < WEIGHT_LIMITS.min || value > WEIGHT_LIMITS.max

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!invalid) update.mutate({ weightGoalKg: value }, { onSuccess: onDone })
      }}
    >
      <p className="text-sm text-ink/70 dark:text-brand-50/70">
        Aparece como línea en el gráfico. Es solo para ti.
      </p>
      <input
        type="text"
        inputMode="decimal"
        placeholder="60,0"
        value={kg}
        onChange={(e) => setKg(e.target.value)}
        className={`${kgInputClass} text-lg font-bold tabular-nums`}
        aria-label="Peso objetivo en kg"
      />
      <ErrorText>{update.error ? errorMessage(update.error) : undefined}</ErrorText>
      <Button type="submit" busy={update.isPending} disabled={invalid}>
        Guardar objetivo
      </Button>
      {settings.weightGoalKg !== null && (
        <Button
          variant="ghost"
          onClick={() => update.mutate({ weightGoalKg: null }, { onSuccess: onDone })}
        >
          Quitar objetivo
        </Button>
      )}
    </form>
  )
}
