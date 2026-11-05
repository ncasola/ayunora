import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import type { z } from 'zod'
import type { ApiErrorCode } from '../shared/api'
import { SESSION_COOKIE, setSessionCookie, validateSession } from './auth/session'
import type { Db } from './db'
import type { UserRow } from './db/schema'

export type AppEnv = {
  Variables: {
    user: UserRow | null
  }
}

export type AuthedEnv = {
  Variables: {
    user: UserRow
  }
}

export function apiError(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 429,
  error: ApiErrorCode,
  details?: unknown,
) {
  return c.json(details === undefined ? { error } : { error, details }, status)
}

/** Lee y valida el JSON del body. Devuelve los datos, o la respuesta 400 que hay que retornar. */
export async function readJson<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<{ data: z.output<T> } | { response: Response }> {
  const body: unknown = await c.req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    return { response: apiError(c, 400, 'validation_error', details) }
  }
  return { data: parsed.data }
}

/** IP del cliente. Nginx la pone en X-Real-IP, con la IP real que llega por Cloudflare. */
export function clientIp(c: Context): string {
  return c.req.header('x-real-ip') ?? c.req.header('cf-connecting-ip') ?? 'local'
}

export function sessionMiddleware(db: Db, secureCookies: boolean) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE)
    const session = token ? validateSession(db, token) : null
    c.set('user', session?.user ?? null)
    if (token && session?.renewed) setSessionCookie(c, token, secureCookies)
    await next()
  })
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) return apiError(c, 401, 'unauthorized')
  await next()
})

/**
 * Protección CSRF además de SameSite=Lax: las peticiones que modifican datos deben venir
 * del mismo host. Se compara con la cabecera Host porque detrás del proxy la URL interna es
 * http://127.0.0.1, mientras que el Origin es https://ayunora.es.
 */
export const sameOriginOnly = createMiddleware(async (c, next) => {
  const method = c.req.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  const origin = c.req.header('origin')
  if (origin) {
    let originHost: string
    try {
      originHost = new URL(origin).host
    } catch {
      return apiError(c, 403, 'forbidden_origin')
    }
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host')
    if (originHost !== host) return apiError(c, 403, 'forbidden_origin')
  }
  await next()
})
