import { timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { loginSchema, registerSchema, type AuthConfigDto } from '../../shared/api'
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
import type { TurnstileAction } from '../turnstile'
import { toMeDto } from './me'

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function authRoutes({ db, config, turnstile }: AppDeps) {
  // Por IP: frena a un atacante concreto. Por email: frena el ataque repartido entre muchas
  // IPs contra una misma cuenta. Ninguno se reinicia al acertar: si no, quien tuviera una
  // cuenta válida podría seguir probando contraseñas de la otra.
  const loginByIp = new RateLimiter(10, 15 * 60 * 1000)
  const loginByEmail = new RateLimiter(10, 60 * 60 * 1000)
  const registerByIp = new RateLimiter(5, 60 * 60 * 1000)

  /** Devuelve la respuesta de error si el token de Turnstile no vale, o null si pasa. */
  async function checkTurnstile(c: Context, token: unknown, action: TurnstileAction) {
    if (!turnstile) return null
    const result = await turnstile.verifier.verify(token, action, clientIp(c))
    if (result.ok) return null
    if (result.reason === 'unavailable') {
      console.error('[turnstile] no se pudo verificar con Cloudflare')
      return c.json({ error: 'captcha_unavailable' }, 503)
    }
    return apiError(c, 403, 'captcha_failed')
  }

  return (
    new Hono<AppEnv>()
      // Clave pública del widget. Sin sesión: la necesita la pantalla de login.
      .get('/config', (c) => {
        const dto: AuthConfigDto = { turnstileSiteKey: turnstile?.siteKey ?? null }
        return c.json(dto)
      })

      .post('/register', async (c) => {
        if (!registerByIp.take(clientIp(c))) return apiError(c, 429, 'rate_limited')
        const body = await readJson(c, registerSchema)
        if ('response' in body) return body.response
        const input = body.data

        // Turnstile antes que el código de invitación: un bot no puede ir probando códigos.
        const captcha = await checkTurnstile(c, input.turnstileToken, 'register')
        if (captcha) return captcha

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
        if (!loginByIp.take(clientIp(c))) return apiError(c, 429, 'rate_limited')
        const body = await readJson(c, loginSchema)
        if ('response' in body) return body.response
        const { email, password, turnstileToken } = body.data
        if (!loginByEmail.take(email)) return apiError(c, 429, 'rate_limited')

        // Turnstile antes de comprobar la contraseña: scrypt es caro a propósito, y así un bot
        // no puede usar el login para gastar CPU del servidor.
        const captcha = await checkTurnstile(c, turnstileToken, 'login')
        if (captcha) return captcha

        const user = db.select().from(users).where(eq(users.email, email)).get()
        // Si el usuario no existe se verifica contra un hash falso, para no revelarlo por el tiempo de respuesta.
        const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()))
        if (!user || !ok) return apiError(c, 401, 'invalid_credentials')

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
  )
}
