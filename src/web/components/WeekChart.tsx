import { useState } from 'react'
import type { DayStat } from '../../shared/stats'
import { capitalizeFirst, formatDuration, formatGoal } from '../lib/format'

// Barras de los últimos 7 días: una serie, horas ayunadas por día.
// - Color: dos tonos del mismo color (validados con el validador de dataviz en claro y en
//   oscuro). El más intenso marca los días con el objetivo cumplido. No depende solo del
//   color: esos días llevan además un ✓.
// - Marcas finas con el extremo redondeado de 4 px y anclado a la base, y una línea de
//   referencia discontinua en el objetivo.
// - Al tocar una columna (zona de toque = toda la columna) se ve su valor arriba. Cada columna
//   es un botón con aria-label, así que el lector de pantalla tiene los mismos datos.

const W = 320
const H = 150
const TOP = 18
const BOTTOM = 22
const SLOT = W / 7
const BAR = 22
const R = 4

const weekdayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'narrow' })
const longFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
// Mediodía local, para que la fecha no se desplace por la zona horaria.
const toDate = (day: string) => new Date(`${day}T12:00:00`)

/** Barra con solo las esquinas superiores redondeadas, anclada a la línea base. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(R, h, w / 2)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

export function WeekChart({ days, goalMinutes }: { days: DayStat[]; goalMinutes: number }) {
  const [selected, setSelected] = useState<number | null>(null)
  const plotH = H - TOP - BOTTOM
  const baseY = TOP + plotH
  // Escala en saltos de 4 h, con hueco para el objetivo.
  const maxMinutes = Math.max(goalMinutes, ...days.map((d) => d.minutes), 60)
  const scaleMax = Math.ceil(maxMinutes / 240) * 240
  const y = (min: number) => baseY - (min / scaleMax) * plotH
  const goalY = y(goalMinutes)
  const sel = selected !== null ? days[selected] : undefined

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex min-h-10 items-baseline justify-between gap-2">
        <span className="font-bold">Últimos 7 días</span>
        <span className="text-right text-sm text-ink/70 dark:text-brand-50/70" aria-live="polite">
          {sel ? (
            <>
              {capitalizeFirst(longFmt.format(toDate(sel.day)))}
              {' · '}
              <strong className="text-ink dark:text-brand-50">
                {sel.minutes > 0 ? formatDuration(sel.minutes * 60_000) : 'sin ayuno'}
              </strong>
              {sel.goalMet && ' ✓'}
            </>
          ) : (
            'Toca un día para ver el detalle'
          )}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Horas de ayuno por día"
      >
        {/* Línea base y de objetivo, en segundo plano */}
        <line
          x1={0}
          x2={W}
          y1={baseY}
          y2={baseY}
          className="stroke-ink/15 dark:stroke-white/15"
          strokeWidth={1}
        />
        <line
          x1={0}
          x2={W}
          y1={goalY}
          y2={goalY}
          strokeDasharray="4 4"
          strokeWidth={1}
          className="stroke-ink/40 dark:stroke-white/40"
        />
        <text
          x={W - 2}
          y={goalY - 4}
          textAnchor="end"
          className="fill-ink/60 text-[10px] font-medium dark:fill-brand-50/60"
        >
          objetivo {formatGoal(goalMinutes)}
        </text>

        {days.map((d, i) => {
          const cx = i * SLOT + SLOT / 2
          const top = y(d.minutes)
          const isToday = i === days.length - 1
          const active = selected === i
          return (
            <g key={d.day}>
              {/* La columna seleccionada se resalta con un fondo. No se atenúan las demás:
                  en oscuro, una barra cumplida atenuada se confundiría con una no cumplida. */}
              {active && (
                <rect
                  x={i * SLOT + 3}
                  y={2}
                  width={SLOT - 6}
                  height={baseY - 2}
                  rx={8}
                  className="fill-ink/6 dark:fill-white/8"
                />
              )}
              {d.minutes > 0 && (
                <path
                  d={barPath(cx - BAR / 2, top, BAR, baseY - top)}
                  className={
                    d.goalMet
                      ? 'fill-brand-700 dark:fill-brand-300'
                      : 'fill-[#e5906a] dark:fill-[#8a5a45]'
                  }
                />
              )}
              {d.goalMet && (
                <text
                  x={cx}
                  y={top - 4}
                  textAnchor="middle"
                  className="fill-ink text-[11px] font-bold dark:fill-brand-50"
                >
                  ✓
                </text>
              )}
              <text
                x={cx}
                y={H - 6}
                textAnchor="middle"
                className={`text-[11px] uppercase ${
                  isToday
                    ? 'fill-ink font-extrabold dark:fill-brand-50'
                    : 'fill-ink/55 font-medium dark:fill-brand-50/55'
                }`}
              >
                {weekdayFmt.format(toDate(d.day))}
              </text>
              {/* Zona de toque: toda la columna, más grande que la barra. */}
              <rect
                x={i * SLOT}
                y={0}
                width={SLOT}
                height={H}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-label={`${longFmt.format(toDate(d.day))}: ${
                  d.minutes > 0 ? formatDuration(d.minutes * 60_000) : 'sin ayuno'
                }${d.goalMet ? ', objetivo cumplido' : ''}`}
                onClick={() => setSelected(active ? null : i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelected(active ? null : i)
                }}
                className="cursor-pointer outline-none"
              />
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
