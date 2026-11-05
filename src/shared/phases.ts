// Fases del ayuno. Es la única fuente de verdad para la UI y para los hitos de las
// notificaciones (M2). Contenido informativo y orientativo; no es consejo médico.

export type Phase = {
  id: 'digestion' | 'sugar-drop' | 'fat-burn' | 'ketosis' | 'autophagy'
  startHour: number
  name: string
  emoji: string
  description: string
}

export const PHASES: readonly Phase[] = [
  {
    id: 'digestion',
    startHour: 0,
    name: 'Digestión',
    emoji: '🍽️',
    description: 'Tu cuerpo procesa la última comida y el azúcar en sangre sube.',
  },
  {
    id: 'sugar-drop',
    startHour: 4,
    name: 'Bajada de azúcar',
    emoji: '📉',
    description: 'La insulina se estabiliza y empiezas a tirar de las reservas de glucógeno.',
  },
  {
    id: 'fat-burn',
    startHour: 12,
    name: 'Quema de grasa',
    emoji: '🔥',
    description: 'El glucógeno se agota y la grasa pasa a ser tu principal fuente de energía.',
  },
  {
    id: 'ketosis',
    startHour: 18,
    name: 'Cetosis',
    emoji: '⚡',
    description: 'Aumenta la producción de cuerpos cetónicos, un combustible muy eficiente.',
  },
  {
    id: 'autophagy',
    startHour: 24,
    name: 'Autofagia',
    emoji: '♻️',
    description: 'Se intensifican los procesos de limpieza y reciclaje celular.',
  },
]

const HOUR_MS = 60 * 60 * 1000

export type PhaseState = {
  phase: Phase
  index: number
  next: Phase | null
  /** Milisegundos hasta la siguiente fase; `null` si es la última. */
  msToNext: number | null
}

export function phaseAt(elapsedMs: number): PhaseState {
  const elapsed = Math.max(0, elapsedMs)
  let index = 0
  for (let i = 0; i < PHASES.length; i++) {
    if (elapsed >= PHASES[i]!.startHour * HOUR_MS) index = i
  }
  const phase = PHASES[index]!
  const next = PHASES[index + 1] ?? null
  return {
    phase,
    index,
    next,
    msToNext: next ? next.startHour * HOUR_MS - elapsed : null,
  }
}
