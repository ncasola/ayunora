import { z } from 'zod'

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
})

export type Env = z.infer<typeof envSchema> & { cookieSecure: boolean }

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Configuración inválida:\n${problems.join('\n')}`)
  }
  const env = parsed.data
  const cookieSecure = env.COOKIE_SECURE
    ? env.COOKIE_SECURE === 'true'
    : env.NODE_ENV === 'production'
  return { ...env, cookieSecure }
}
