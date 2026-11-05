import { and, asc, eq, lte } from 'drizzle-orm'
import type { PushPayload } from '../shared/push'
import { buildFastJobs, dailyReminderPayload } from '../shared/schedule'
import { nextDailyOccurrence } from '../shared/tz'
import type { Db } from './db'
import {
  notificationJobs,
  pushSubscriptions,
  users,
  type FastRow,
  type JobStatus,
  type NotificationJobRow,
} from './db/schema'
import { sendToSubscriptions, type PushSender } from './push'
import { findActiveFast, getSettings } from './repo'

// Planificador de notificaciones (SPEC §6). Las rutas solo escriben o cancelan filas en
// `notification_jobs`, y un bucle en el mismo proceso envía las que vencen.

/** Pasado este retraso (p. ej. tras una caída), los avisos dejan de tener sentido. Salvo el de objetivo. */
export const STALE_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 60 * 1000
const BATCH_SIZE = 50

function setStatus(db: Db, id: number, status: JobStatus, now: number) {
  db.update(notificationJobs)
    .set({ status, sentAt: status === 'sent' ? new Date(now) : null })
    .where(eq(notificationJobs.id, id))
    .run()
}

export function cancelFastJobs(db: Db, fastId: number) {
  db.update(notificationJobs)
    .set({ status: 'canceled' })
    .where(and(eq(notificationJobs.fastId, fastId), eq(notificationJobs.status, 'pending')))
    .run()
}

/** Rehace los avisos de un ayuno: cancela los pendientes y, si sigue en curso, crea los que tocan. */
export function scheduleFastJobs(db: Db, fast: FastRow, now: number) {
  db.transaction(() => {
    cancelFastJobs(db, fast.id)
    if (fast.endedAt) return
    const jobs = buildFastJobs(
      { id: fast.id, startedAt: fast.startedAt.getTime(), goalMinutes: fast.goalMinutes },
      getSettings(db, fast.userId),
      now,
    )
    if (jobs.length === 0) return
    db.insert(notificationJobs)
      .values(
        jobs.map((j) => ({
          userId: fast.userId,
          fastId: fast.id,
          kind: j.kind,
          sendAt: new Date(j.sendAt),
          payload: JSON.stringify(j.payload),
          createdAt: new Date(now),
        })),
      )
      .run()
  })
}

/** Deja como mucho un recordatorio diario pendiente por usuario: el de la próxima ocurrencia. */
export function scheduleDailyReminder(db: Db, userId: number, now: number) {
  db.transaction(() => {
    db.update(notificationJobs)
      .set({ status: 'canceled' })
      .where(
        and(
          eq(notificationJobs.userId, userId),
          eq(notificationJobs.kind, 'daily_reminder'),
          eq(notificationJobs.status, 'pending'),
        ),
      )
      .run()

    const s = getSettings(db, userId)
    if (!s.reminderEnabled) return
    const user = db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .get()
    if (!user) return
    db.insert(notificationJobs)
      .values({
        userId,
        kind: 'daily_reminder',
        sendAt: new Date(nextDailyOccurrence(now, s.reminderTime, user.timezone)),
        payload: JSON.stringify(dailyReminderPayload),
        createdAt: new Date(now),
      })
      .run()
  })
}

/** Tras cambiar los ajustes o la zona horaria: rehace todo lo pendiente del usuario. */
export function rescheduleUser(db: Db, userId: number, now: number) {
  const active = findActiveFast(db, userId)
  if (active) scheduleFastJobs(db, active, now)
  scheduleDailyReminder(db, userId, now)
}

/** Al arrancar: repara los recordatorios que falten (p. ej. si se perdió alguno por una caída). */
export function ensureReminders(db: Db, now: number) {
  const enabled = db
    .select({ userId: users.id })
    .from(users)
    .all()
    .filter((u) => getSettings(db, u.userId).reminderEnabled)
  for (const { userId } of enabled) {
    const pending = db
      .select({ id: notificationJobs.id })
      .from(notificationJobs)
      .where(
        and(
          eq(notificationJobs.userId, userId),
          eq(notificationJobs.kind, 'daily_reminder'),
          eq(notificationJobs.status, 'pending'),
        ),
      )
      .get()
    if (!pending) scheduleDailyReminder(db, userId, now)
  }
}

export type TickResult = { sent: number; skipped: number; retried: number; failed: number }

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | undefined
  private running = false

  constructor(
    private readonly deps: { db: Db; push: PushSender; now: () => number },
    private readonly intervalMs = 15_000,
  ) {}

  start() {
    ensureReminders(this.deps.db, this.deps.now())
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
    this.timer.unref()
    void this.tick()
  }

  stop() {
    clearInterval(this.timer)
  }

  /** Envía los avisos vencidos. Nunca se solapan dos ejecuciones. */
  async tick(): Promise<TickResult> {
    const result: TickResult = { sent: 0, skipped: 0, retried: 0, failed: 0 }
    if (this.running) return result
    this.running = true
    try {
      const { db } = this.deps
      const now = this.deps.now()
      const due = db
        .select()
        .from(notificationJobs)
        .where(
          and(eq(notificationJobs.status, 'pending'), lte(notificationJobs.sendAt, new Date(now))),
        )
        .orderBy(asc(notificationJobs.sendAt))
        .limit(BATCH_SIZE)
        .all()

      for (const job of due) {
        const outcome = await this.process(job, now)
        result[outcome]++
      }
    } catch (err) {
      console.error('[scheduler] error en tick', err)
    } finally {
      this.running = false
    }
    return result
  }

  private async process(job: NotificationJobRow, now: number): Promise<keyof TickResult> {
    const { db, push } = this.deps
    const isReminder = job.kind === 'daily_reminder'
    const late = now - job.sendAt.getTime()

    const skip = (): keyof TickResult => {
      setStatus(db, job.id, 'canceled', now)
      if (isReminder) scheduleDailyReminder(db, job.userId, now)
      return 'skipped'
    }

    // Tras una caída larga, un «llevas 12 h» o un «¿empezamos?» atrasados ya no aportan.
    // El de objetivo cumplido sí se envía, aunque llegue tarde.
    if (late > STALE_MS && job.kind !== 'goal') return skip()
    // No tiene sentido recordar que empiece un ayuno a quien ya está ayunando.
    if (isReminder && findActiveFast(db, job.userId)) return skip()

    const targets = db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, job.userId))
      .all()
    if (targets.length === 0) return skip()

    const payload = JSON.parse(job.payload) as PushPayload
    const res = await sendToSubscriptions(db, push, targets, payload)

    // Basta con que llegue a un dispositivo. Si todos han caducado (gone), tampoco hay nada que reintentar.
    if (res.sent > 0 || res.failed === 0) {
      setStatus(db, job.id, 'sent', now)
      if (isReminder) scheduleDailyReminder(db, job.userId, now)
      return 'sent'
    }

    const attempts = job.attempts + 1
    if (attempts >= MAX_ATTEMPTS) {
      db.update(notificationJobs)
        .set({ status: 'failed', attempts })
        .where(eq(notificationJobs.id, job.id))
        .run()
      if (isReminder) scheduleDailyReminder(db, job.userId, now)
      return 'failed'
    }
    db.update(notificationJobs)
      .set({ attempts, sendAt: new Date(now + RETRY_DELAY_MS * attempts) })
      .where(eq(notificationJobs.id, job.id))
      .run()
    return 'retried'
  }
}
