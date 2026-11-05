import { createHash, randomBytes } from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import type { Db } from '../db'
import { sessions, users, type UserRow } from '../db/schema'

export const SESSION_COOKIE = 'ayunora_session'
const DAY_MS = 24 * 60 * 60 * 1000
/** Sesión de 1 año que se renueva con el uso: en la PWA no se vuelve a pedir login. */
export const SESSION_TTL_MS = 365 * DAY_MS
/** Como mucho una escritura al día por sesión para renovarla. */
const RENEW_AFTER_MS = DAY_MS

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function createSession(db: Db, userId: number, userAgent: string | null, now = Date.now()) {
  const token = randomBytes(32).toString('base64url')
  db.insert(sessions)
    .values({
      id: hashToken(token),
      userId,
      userAgent,
      createdAt: new Date(now),
      lastSeenAt: new Date(now),
      expiresAt: new Date(now + SESSION_TTL_MS),
    })
    .run()
  return token
}

export type SessionLookup = { user: UserRow; renewed: boolean } | null

export function validateSession(db: Db, token: string, now = Date.now()): SessionLookup {
  const id = hashToken(token)
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .get()
  if (!row) return null

  if (row.session.expiresAt.getTime() <= now) {
    db.delete(sessions).where(eq(sessions.id, id)).run()
    return null
  }

  const renewed = now - row.session.lastSeenAt.getTime() > RENEW_AFTER_MS
  if (renewed) {
    db.update(sessions)
      .set({ lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) })
      .where(eq(sessions.id, id))
      .run()
  }
  return { user: row.user, renewed }
}

export function deleteSession(db: Db, token: string) {
  db.delete(sessions)
    .where(eq(sessions.id, hashToken(token)))
    .run()
}

export function purgeExpiredSessions(db: Db, now = Date.now()) {
  return db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date(now)))
    .run().changes
}

export function setSessionCookie(c: Context, token: string, secure: boolean) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export function clearSessionCookie(c: Context, secure: boolean) {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure })
}
