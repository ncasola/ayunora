import { PHASES } from './phases'
import type { PushPayload } from './push'

// Cálculo puro de qué notificaciones hay que programar para un ayuno. El servidor lo
// persiste en `notification_jobs` y el planificador las envía a su hora (SPEC §6).

export const JOB_KINDS = ['goal', 'pre_end', 'milestone', 'daily_reminder'] as const
export type JobKind = (typeof JOB_KINDS)[number]

export const PRE_END_OPTIONS = [15, 30, 60] as const
export type PreEndMinutes = (typeof PRE_END_OPTIONS)[number]

export type NotificationPrefs = {
  notifyGoal: boolean
  notifyPreEnd: boolean
  preEndMinutes: number
  notifyMilestones: boolean
}

export type PlannedJob = { kind: JobKind; sendAt: number; payload: PushPayload }

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/**
 * Notificaciones de un ayuno en curso que aún deben enviarse (las que caen después de `now`).
 * - goal: al cumplir el objetivo.
 * - pre_end: N minutos antes del objetivo.
 * - milestone: al entrar en cada fase, solo si es antes del objetivo (en el objetivo ya avisa `goal`).
 */
export function buildFastJobs(
  fast: { id: number; startedAt: number; goalMinutes: number },
  prefs: NotificationPrefs,
  now: number,
): PlannedJob[] {
  const goalAt = fast.startedAt + fast.goalMinutes * MINUTE
  const tag = `fast-${fast.id}`
  const jobs: PlannedJob[] = []

  if (prefs.notifyMilestones) {
    for (const phase of PHASES) {
      if (phase.startHour === 0) continue
      const at = fast.startedAt + phase.startHour * HOUR
      if (at > now && at < goalAt) {
        jobs.push({
          kind: 'milestone',
          sendAt: at,
          payload: {
            title: `${phase.emoji} ${phase.name}`,
            body: `Llevas ${phase.startHour} h de ayuno. ${phase.description}`,
            url: '/',
            tag,
          },
        })
      }
    }
  }

  if (prefs.notifyPreEnd) {
    const at = goalAt - prefs.preEndMinutes * MINUTE
    if (at > now && at > fast.startedAt) {
      jobs.push({
        kind: 'pre_end',
        sendAt: at,
        payload: {
          title: 'Ya casi está ⏳',
          body: `Te quedan ${formatHours(prefs.preEndMinutes)} para completar tu ayuno de ${formatHours(fast.goalMinutes)}.`,
          url: '/',
          tag,
        },
      })
    }
  }

  if (prefs.notifyGoal && goalAt > now) {
    jobs.push({
      kind: 'goal',
      sendAt: goalAt,
      payload: {
        title: '¡Objetivo cumplido! 🎉',
        body: `Has completado tu ayuno de ${formatHours(fast.goalMinutes)}. ¡Enhorabuena!`,
        url: '/',
        tag,
      },
    })
  }

  return jobs.sort((a, b) => a.sendAt - b.sendAt)
}

export const dailyReminderPayload: PushPayload = {
  title: '¿Empezamos? 🌅',
  body: 'Es tu hora de empezar el ayuno. Toca para ponerlo en marcha.',
  url: '/',
  tag: 'daily-reminder',
}
