import { useState, type PointerEvent } from 'react'
import type { WeightDto } from '../../shared/weights'
import { capitalizeFirst, formatKg } from '../lib/format'

// Evolución del peso: una sola serie, así que no hay leyenda (el título la nombra).
// - Línea de 2 px con eje X proporcional al tiempo (los huecos sin pesarse se ven como
//   huecos) y marcadores de 8 px con un anillo del color de la superficie. Con muchos
//   puntos solo se marca el último, para no saturar.
// - Peso objetivo como línea de referencia discontinua.
// - Al tocar o arrastrar por el gráfico, se ve el registro más cercano arriba.
//   Color validado igual que el del gráfico semanal (brand-700 / brand-300).

const W = 320
const H = 170
const PAD = { top: 14, right: 8, bottom: 20, left: 34 }
const MAX_MARKERS = 40

const DAY_MS = 86_400_000
const dayNum = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS
const longFmt = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const shortFmt = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const dayDate = (day: string) => new Date(`${day}T00:00:00Z`)

export function WeightChart({ entries, goalKg }: { entries: WeightDto[]; goalKg: number | null }) {
  const [hover, setHover] = useState<number | null>(null)
  if (entries.length === 0) return null

  const xs = entries.map((e) => dayNum(e.day))
  const kgs = entries.map((e) => e.kg)
  const x0 = xs[0]!
  const x1 = Math.max(xs.at(-1)!, x0 + 1)
  const lo = Math.floor(Math.min(...kgs, goalKg ?? Infinity) - 1)
  const hi = Math.ceil(Math.max(...kgs, goalKg ?? -Infinity) + 1)
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (n: number) => PAD.left + ((n - x0) / (x1 - x0)) * plotW
  const y = (kg: number) => PAD.top + ((hi - kg) / (hi - lo)) * plotH

  const points = entries.map((e, i) => ({ e, px: x(xs[i]!), py: y(e.kg) }))
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px.toFixed(1)},${p.py.toFixed(1)}`)
    .join(' ')
  const sel = hover !== null ? points[hover] : points.at(-1)

  const pick = (ev: PointerEvent<SVGRectElement>) => {
    const rect = ev.currentTarget.ownerSVGElement!.getBoundingClientRect()
    const px = ((ev.clientX - rect.left) / rect.width) * W
    let best = 0
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i]!.px - px) < Math.abs(points[best]!.px - px)) best = i
    }
    setHover(best)
  }

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex min-h-6 items-baseline justify-between gap-2" aria-live="polite">
        <span className="font-bold">Evolución</span>
        {sel && (
          <span className="text-sm text-ink/70 dark:text-brand-50/70">
            {capitalizeFirst(longFmt.format(dayDate(sel.e.day)))} ·{' '}
            <strong className="text-ink dark:text-brand-50">{formatKg(sel.e.kg)}</strong>
          </span>
        )}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y"
        role="img"
        aria-label={`Peso de ${shortFmt.format(dayDate(entries[0]!.day))} a ${shortFmt.format(dayDate(entries.at(-1)!.day))}: de ${formatKg(kgs[0]!)} a ${formatKg(kgs.at(-1)!)}`}
      >
        {/* Ejes recesivos: solo las etiquetas de mínimo y máximo, y una línea base. */}
        {[hi, lo].map((v) => (
          <text
            key={v}
            x={PAD.left - 6}
            y={y(v) + 3}
            textAnchor="end"
            className="fill-ink/50 text-[10px] dark:fill-brand-50/50"
          >
            {v}
          </text>
        ))}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          strokeWidth={1}
          className="stroke-ink/15 dark:stroke-white/15"
        />
        <text x={PAD.left} y={H - 4} className="fill-ink/50 text-[10px] dark:fill-brand-50/50">
          {shortFmt.format(dayDate(entries[0]!.day))}
        </text>
        <text
          x={W - PAD.right}
          y={H - 4}
          textAnchor="end"
          className="fill-ink/50 text-[10px] dark:fill-brand-50/50"
        >
          {shortFmt.format(dayDate(entries.at(-1)!.day))}
        </text>

        {goalKg !== null && (
          <>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(goalKg)}
              y2={y(goalKg)}
              strokeDasharray="4 4"
              strokeWidth={1}
              className="stroke-ink/40 dark:stroke-white/40"
            />
            <text
              x={W - PAD.right}
              y={y(goalKg) - 4}
              textAnchor="end"
              className="fill-ink/60 text-[10px] font-medium dark:fill-brand-50/60"
            >
              objetivo {formatKg(goalKg)}
            </text>
          </>
        )}

        {/* Guía vertical solo mientras se toca: fija sobre el último punto parecería un borde. */}
        {sel && hover !== null && (
          <line
            x1={sel.px}
            x2={sel.px}
            y1={PAD.top}
            y2={PAD.top + plotH}
            strokeWidth={1}
            className="stroke-ink/20 dark:stroke-white/20"
          />
        )}
        <path
          d={d}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-brand-700 dark:stroke-brand-300"
        />
        {points.map((p, i) =>
          points.length <= MAX_MARKERS || i === points.length - 1 || i === hover ? (
            <circle
              key={p.e.day}
              cx={p.px}
              cy={p.py}
              r={4}
              strokeWidth={2}
              className="fill-brand-700 stroke-white dark:fill-brand-300 dark:stroke-[#27201c]"
            />
          ) : null,
        )}

        {/* Zona de toque: todo el gráfico. */}
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="transparent"
          onPointerDown={pick}
          onPointerMove={(ev) =>
            ev.buttons > 0 || ev.pointerType === 'mouse' ? pick(ev) : undefined
          }
          onPointerLeave={() => setHover(null)}
        />
      </svg>
    </figure>
  )
}
