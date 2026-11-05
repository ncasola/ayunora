import type { ReactNode } from 'react'

/**
 * Anillo de progreso. `progress` puede pasar de 1: el anillo queda completo y cambia de
 * color para indicar que el objetivo se ha cumplido. `marks` son fracciones (0..1) donde
 * se pintan puntos, por ejemplo el inicio de cada fase.
 */
export function ProgressRing({
  progress,
  marks = [],
  size = 288,
  stroke = 22,
  children,
}: {
  progress: number
  marks?: number[]
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.min(Math.max(progress, 0), 1)
  const done = progress >= 1

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb36b" />
            <stop offset="1" stopColor="#ef6f5a" />
          </linearGradient>
        </defs>
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-brand-100 dark:stroke-white/10"
        />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={done ? '#3fa47a' : 'url(#ring-gradient)'}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{ transition: 'stroke-dashoffset 600ms ease, stroke 300ms' }}
          opacity={clamped === 0 ? 0 : 1}
        />
        {marks
          .filter((m) => m > 0 && m < 1)
          .map((m) => {
            const angle = m * 2 * Math.PI
            return (
              <circle
                key={m}
                cx={c + r * Math.cos(angle)}
                cy={c + r * Math.sin(angle)}
                r={3.5}
                className={m <= clamped ? 'fill-white/90' : 'fill-brand-300 dark:fill-white/30'}
              />
            )
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  )
}
