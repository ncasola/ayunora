import { timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { loginSchema, registerSchema } from '../../shared/api'
import { getDummyHash, hashPassword, verifyPassword } from '../auth/password'
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  setSessionCookie,
} from '../auth/session'
import { apiError, clientIp, readJson, type AppEnv } from '../context'
import { settings, users } from '../db/schema'
import { isUniqueViolation, type AppDeps } from '../deps'
import { RateLimiter } from '../rate-limit'
import { toMeDto } from './me'

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function authRoutes({ db, config }: AppDeps) {
  const loginLimiter = new RateLimiter(10, 15 * 60 * 1000)
  const registerLimiter = new RateLimiter(5, 60 * 60 * 1000)

  return new Hono<AppEnv>()
    .post('/register', async (c) => {
      if (!registerLimiter.take(clientIp(c))) return apiError(c, 429, 'rate_limited')
      const body = await readJson(c, registerSchema)
      if ('response' in body) return body.response
      const input = body.data

      if (!safeEqual(input.inviteCode.trim(), config.inviteCode)) {
        return apiError(c, 403, 'invalid_invite')
      }

      const passwordHash = await hashPassword(input.password)
      let userId: number
      try {
        userId = db.transaction((tx) => {
          const user = tx
            .insert(users)
            .values({
              email: input.email,
              passwordHash,
              name: input.name,
              timezone: input.timezone,
            })
            .returning({ id: users.id })
            .get()
          tx.insert(settings).values({ userId: user.id }).run()
          return user.id
        })
      } catch (err) {
        if (isUniqueViolation(err)) return apiError(c, 409, 'email_taken')
        throw err
      }

      const token = createSession(db, userId, c.req.header('user-agent') ?? null)
      setSessionCookie(c, token, config.secureCookies)
      const user = db.select().from(users).where(eq(users.id, userId)).get()!
      return c.json(toMeDto(db, user), 201)
    })

    .post('/login', async (c) => {
      const ip = clientIp(c)
      if (!loginLimiter.take(ip)) return apiError(c, 429, 'rate_limited')
      const body = await readJson(c, loginSchema)
      if ('response' in body) return body.response
      const { email, password } = body.data

      const user = db.select().from(users).where(eq(users.email, email)).get()
      // Si el usuario no existe se verifica contra un hash falso, para no revelarlo por el tiempo de respuesta.
      const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()))
      if (!user || !ok) return apiError(c, 401, 'invalid_credentials')

      loginLimiter.reset(ip)
      const token = createSession(db, user.id, c.req.header('user-agent') ?? null)
      setSessionCookie(c, token, config.secureCookies)
      return c.json(toMeDto(db, user))
    })

    .post('/logout', (c) => {
      const token = getCookie(c, SESSION_COOKIE)
      if (token) deleteSession(db, token)
      clearSessionCookie(c, config.secureCookies)
      return c.json({ ok: true })
    })
}
