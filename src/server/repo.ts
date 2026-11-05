import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from './db'
import { fasts, settings, type SettingsRow } from './db/schema'

// Consultas que comparten las rutas y el planificador.

export function getSettings(db: Db, userId: number): SettingsRow {
  const row = db.select().from(settings).where(eq(settings.userId, userId)).get()
  if (row) return row
  return db.insert(settings).values({ userId }).returning().get()
}

export function findActiveFast(db: Db, userId: number) {
  return db
    .select()
    .from(fasts)
    .where(and(eq(fasts.userId, userId), isNull(fasts.endedAt)))
    .get()
}
