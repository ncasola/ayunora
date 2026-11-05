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
  SETUP_TOKEN: z.string().min(16, 'SETUP_TOKEN debe tener al menos 16 caracteres'),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Configuración inválida:\n${problems.join('\n')}`)
  }
  return parsed.data
}
