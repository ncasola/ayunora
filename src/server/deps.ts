import type { Db } from './db'
import type { PushSender } from './push'

export type AppDeps = {
  db: Db
  push: PushSender
  config: {
    devLogging: boolean
    secureCookies: boolean
    vapidPublicKey: string
    inviteCode: string
    webDist: string
  }
  /** Reloj inyectable para los tests. */
  now: () => number
}

/** Busca un error de restricción UNIQUE de SQLite, aunque Drizzle lo envuelva. */
export function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err
  for (let i = 0; i < 3 && e; i++) {
    if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') return true
    e = (e as { cause?: unknown }).cause
  }
  return false
}
