import { useState } from 'react'
import { formatDayClock, fromDateTimeLocal, toDateTimeLocal } from '../lib/format'
import { Button, ErrorText, Sheet } from './ui'

/** Hoja para elegir fecha y hora, acotada a [min, max]. `max` es «ahora» en todos los usos. */
export function DateTimeSheet(props: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  initial: number
  min?: number
  max: number
  confirmLabel: string
  busy?: boolean
  error?: string
  onConfirm: (ms: number) => void
}) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.title}>
      {/* Se monta al abrir, así el estado interno empieza de cero cada vez. */}
      {props.open && <DateTimeForm {...props} />}
    </Sheet>
  )
}

function DateTimeForm({
  description,
  initial,
  min,
  max,
  confirmLabel,
  busy,
  error,
  onConfirm,
}: Parameters<typeof DateTimeSheet>[0]) {
  const [value, setValue] = useState(() => toDateTimeLocal(initial))
  const ms = value ? fromDateTimeLocal(value) : NaN
  const outOfRange = Number.isNaN(ms) || ms > max || (min !== undefined && ms < min)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!outOfRange) onConfirm(ms)
      }}
    >
      {description && <p className="text-sm text-ink/70 dark:text-brand-50/70">{description}</p>}
      <input
        type="datetime-local"
        value={value}
        min={min !== undefined ? toDateTimeLocal(min) : undefined}
        max={toDateTimeLocal(max)}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-14 w-full rounded-2xl border border-brand-200 bg-white px-4 text-lg text-ink dark:border-white/10 dark:bg-white/10 dark:text-brand-50"
      />
      {!Number.isNaN(ms) && (
        <p className="text-center text-sm font-medium">{formatDayClock(ms, max)}</p>
      )}
      {outOfRange && value && (
        <ErrorText>
          {ms > max
            ? 'No puede ser en el futuro.'
            : `Tiene que ser después de ${formatDayClock(min!, max)}.`}
        </ErrorText>
      )}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy} disabled={outOfRange}>
        {confirmLabel}
      </Button>
    </form>
  )
}
