import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Convención: todas las fechas son enteros con milisegundos UTC (ver docs/SPEC.md §5).
const timestampMs = (name: string) => integer(name, { mode: 'timestamp_ms' })

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestampMs('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  lastSuccessAt: timestampMs('last_success_at'),
})

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
