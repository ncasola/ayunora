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

export function getSettings(db: Db, userId: number): SettingsRow {
  const row = db.select().from(settings).where(eq(settings.userId, userId)).get()
  if (row) return row
  return db.insert(settings).values({ userId }).returning().get()
}

export function toSettingsDto(row: SettingsRow): SettingsDto {
  return { defaultPlan: row.defaultPlan, customGoalMinutes: row.customGoalMinutes }
}

export function toMeDto(db: Db, user: UserRow): MeDto {
  return {
    user: { id: user.id, email: user.email, name: user.name, timezone: user.timezone },
    settings: toSettingsDto(getSettings(db, user.id)),
  }
}

export function meRoutes({ db }: AppDeps) {
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
      return c.json(toMeDto(db, updated))
    })
}

export function settingsRoutes({ db }: AppDeps) {
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
      return c.json(toSettingsDto(getSettings(db, userId)))
    })
}
