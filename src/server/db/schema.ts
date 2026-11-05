import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { PlanId } from '../../shared/plans'

// Convención: todas las fechas son enteros con milisegundos UTC (ver docs/SPEC.md §5).
const timestampMs = (name: string) => integer(name, { mode: 'timestamp_ms' })
const now = () => new Date()

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Europe/Madrid'),
  createdAt: timestampMs('created_at').notNull().$defaultFn(now),
})

export const sessions = sqliteTable(
  'sessions',
  {
    /** sha256 (hex) del token de la cookie. El token en claro nunca se guarda. */
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestampMs('created_at').notNull().$defaultFn(now),
    lastSeenAt: timestampMs('last_seen_at').notNull().$defaultFn(now),
    expiresAt: timestampMs('expires_at').notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

export const settings = sqliteTable('settings', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  defaultPlan: text('default_plan').$type<PlanId>().notNull().default('16:8'),
  customGoalMinutes: integer('custom_goal_minutes').notNull().default(960),
  // Notificaciones (se usan a partir del M2).
  notifyGoal: integer('notify_goal', { mode: 'boolean' }).notNull().default(true),
  notifyPreEnd: integer('notify_pre_end', { mode: 'boolean' }).notNull().default(true),
  preEndMinutes: integer('pre_end_minutes').notNull().default(30),
  notifyMilestones: integer('notify_milestones', { mode: 'boolean' }).notNull().default(true),
  reminderEnabled: integer('reminder_enabled', { mode: 'boolean' }).notNull().default(false),
  reminderTime: text('reminder_time').notNull().default('20:00'),
})

export const fasts = sqliteTable(
  'fasts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: timestampMs('started_at').notNull(),
    /** `null` mientras el ayuno está en curso. */
    endedAt: timestampMs('ended_at'),
    /** Objetivo copiado al empezar: cambiar el plan después no altera el historial. */
    goalMinutes: integer('goal_minutes').notNull(),
    plan: text('plan').$type<PlanId>().notNull(),
    note: text('note'),
    createdAt: timestampMs('created_at').notNull().$defaultFn(now),
    updatedAt: timestampMs('updated_at').notNull().$defaultFn(now),
  },
  (t) => [
    // Como mucho un ayuno activo por usuario: lo garantiza la base de datos.
    uniqueIndex('fasts_one_active_per_user')
      .on(t.userId)
      .where(sql`ended_at IS NULL`),
    index('fasts_user_started_idx').on(t.userId, t.startedAt),
  ],
)

export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestampMs('created_at').notNull().$defaultFn(now),
    lastSuccessAt: timestampMs('last_success_at'),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
)

export type UserRow = typeof users.$inferSelect
export type SettingsRow = typeof settings.$inferSelect
export type FastRow = typeof fasts.$inferSelect
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
