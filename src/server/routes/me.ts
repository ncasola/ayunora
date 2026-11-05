import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  updateMeSchema,
  updateSettingsSchema,
  type MeDto,
  type SettingsDto,
} from '../../shared/api'
import { readJson, requireAuth, type AppEnv } from '../context'
import type { Db } from '../db'
import { settings, users, type SettingsRow, type UserRow } from '../db/schema'
import type { AppDeps } from '../deps'
import { getSettings } from '../repo'
import { rescheduleUser, scheduleDailyReminder } from '../scheduler'

export function toSettingsDto(row: SettingsRow): SettingsDto {
  return {
    defaultPlan: row.defaultPlan,
    customGoalMinutes: row.customGoalMinutes,
    notifyGoal: row.notifyGoal,
    notifyPreEnd: row.notifyPreEnd,
    preEndMinutes: row.preEndMinutes,
    notifyMilestones: row.notifyMilestones,
    reminderEnabled: row.reminderEnabled,
    reminderTime: row.reminderTime,
  }
}

export function toMeDto(db: Db, user: UserRow): MeDto {
  return {
    user: { id: user.id, email: user.email, name: user.name, timezone: user.timezone },
    settings: toSettingsDto(getSettings(db, user.id)),
  }
}

/** Ajustes que afectan a los avisos ya programados. */
const NOTIFICATION_KEYS = [
  'notifyGoal',
  'notifyPreEnd',
  'preEndMinutes',
  'notifyMilestones',
  'reminderEnabled',
  'reminderTime',
] as const

export function meRoutes({ db, now }: AppDeps) {
  return new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/', (c) => c.json(toMeDto(db, c.get('user')!)))
    .patch('/', async (c) => {
      const body = await readJson(c, updateMeSchema)
      if ('response' in body) return body.response
      const user = c.get('user')!
      const updated =
        Object.keys(body.data).length > 0
          ? db.update(users).set(body.data).where(eq(users.id, user.id)).returning().get()!
          : user
      // El recordatorio diario va en hora local: si cambia la zona, se recalcula.
      if (body.data.timezone && body.data.timezone !== user.timezone) {
        scheduleDailyReminder(db, user.id, now())
      }
      return c.json(toMeDto(db, updated))
    })
}

export function settingsRoutes({ db, now }: AppDeps) {
  return new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/', (c) => c.json(toSettingsDto(getSettings(db, c.get('user')!.id))))
    .patch('/', async (c) => {
      const body = await readJson(c, updateSettingsSchema)
      if ('response' in body) return body.response
      const userId = c.get('user')!.id
      getSettings(db, userId)
      if (Object.keys(body.data).length > 0) {
        db.update(settings).set(body.data).where(eq(settings.userId, userId)).run()
      }
      if (NOTIFICATION_KEYS.some((k) => k in body.data)) rescheduleUser(db, userId, now())
      return c.json(toSettingsDto(getSettings(db, userId)))
    })
}
