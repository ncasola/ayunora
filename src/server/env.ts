import { z } from 'zod'
import { isTestingSecret } from './turnstile'

const optionalString = z
  .string()
  .optional()
  .transform((s) => (s?.trim() ? s.trim() : undefined))

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_PATH: z.string().default('./data/ayunora.db'),
  MIGRATIONS_DIR: z.string().default('./drizzle'),
  WEB_DIST: z.string().default('./dist/web'),
  VAPID_PUBLIC_KEY: z.string().min(1, 'Falta VAPID_PUBLIC_KEY (npm run vapid)'),
  VAPID_PRIVATE_KEY: z.string().min(1, 'Falta VAPID_PRIVATE_KEY (npm run vapid)'),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https:\/\/)/, 'VAPID_SUBJECT debe empezar por mailto: o https://')
    .default('https://ayunora.es'),
  /** Código que hay que dar al registrarse: solo quien lo conoce puede crear cuenta. */
  INVITE_CODE: z.string().min(6, 'INVITE_CODE debe tener al menos 6 caracteres'),
  /** Cookies con `Secure`. Por defecto, solo en producción. */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  /** Cloudflare Turnstile en el login y el registro. Obligatorio en producción. */
  TURNSTILE_SITE_KEY: optionalString,
  TURNSTILE_SECRET: optionalString,
  /** Dominios (separados por comas) que debe traer el token verificado. */
  TURNSTILE_HOSTNAMES: optionalString,
})

export type TurnstileConfig = { siteKey: string; secret: string; hostnames: string[] }

export type Env = Omit<
  z.infer<typeof envSchema>,
  'TURNSTILE_SITE_KEY' | 'TURNSTILE_SECRET' | 'TURNSTILE_HOSTNAMES'
> & {
  cookieSecure: boolean
  /** `null` = Turnstile desactivado (solo permitido fuera de producción). */
  turnstile: TurnstileConfig | null
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Configuración inválida:\n${problems.join('\n')}`)
  }
  const { TURNSTILE_SITE_KEY, TURNSTILE_SECRET, TURNSTILE_HOSTNAMES, ...env } = parsed.data
  const production = env.NODE_ENV === 'production'
  const cookieSecure = env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production

  const hostnames = (TURNSTILE_HOSTNAMES ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  const anyTurnstile = Boolean(TURNSTILE_SITE_KEY || TURNSTILE_SECRET || hostnames.length)
  const problems: string[] = []

  // Configuración a medias = error, también en desarrollo: así no se cree protegido quien no lo está.
  if (anyTurnstile || production) {
    if (!TURNSTILE_SITE_KEY) problems.push('Falta TURNSTILE_SITE_KEY')
    if (!TURNSTILE_SECRET) problems.push('Falta TURNSTILE_SECRET')
    if (hostnames.length === 0) problems.push('Falta TURNSTILE_HOSTNAMES (p. ej. ayunora.es)')
    if (production && hostnames.some((h) => LOOPBACK.has(h))) {
      problems.push('TURNSTILE_HOSTNAMES no puede incluir localhost en producción')
    }
    // Con la clave de prueba, Cloudflare da por bueno cualquier token.
    if (production && TURNSTILE_SECRET && isTestingSecret(TURNSTILE_SECRET)) {
      problems.push('TURNSTILE_SECRET es una clave de prueba de Cloudflare: no vale en producción')
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Configuración de Turnstile inválida:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    )
  }

  const turnstile =
    TURNSTILE_SITE_KEY && TURNSTILE_SECRET
      ? { siteKey: TURNSTILE_SITE_KEY, secret: TURNSTILE_SECRET, hostnames }
      : null
  return { ...env, cookieSecure, turnstile }
}
