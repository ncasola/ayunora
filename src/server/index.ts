import { serve } from '@hono/node-server'
import { createApp } from './app'
import { purgeExpiredSessions } from './auth/session'
import { openDb } from './db'
import { loadEnv } from './env'
import { createWebPushSender } from './push'
import { Scheduler } from './scheduler'
import { createTurnstileVerifier } from './turnstile'

// En desarrollo se lee .env. En producción las variables las pone systemd (EnvironmentFile).
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile('.env')
  } catch {
    // Sin .env: se usan las variables del entorno.
  }
}

const env = loadEnv()
const db = openDb(env.DATABASE_PATH, env.MIGRATIONS_DIR)
const push = createWebPushSender(env)
const app = createApp({
  db,
  push,
  turnstile: env.turnstile
    ? {
        siteKey: env.turnstile.siteKey,
        verifier: createTurnstileVerifier({
          secret: env.turnstile.secret,
          hostnames: env.turnstile.hostnames,
          allowTestingKeys: env.NODE_ENV !== 'production',
        }),
      }
    : null,
  config: {
    devLogging: env.NODE_ENV === 'development',
    secureCookies: env.cookieSecure,
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
    inviteCode: env.INVITE_CODE,
    webDist: env.WEB_DIST,
  },
  now: Date.now,
})

if (!env.turnstile) console.warn('[turnstile] desactivado: solo permitido fuera de producción')

const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
  console.log(`Ayunora escuchando en http://${info.address}:${info.port} (${env.NODE_ENV})`)
})

// Planificador de notificaciones: envía los avisos vencidos cada 15 s.
const scheduler = new Scheduler({ db, push, now: Date.now })
scheduler.start()

const housekeeping = setInterval(() => purgeExpiredSessions(db), 6 * 60 * 60 * 1000)
housekeeping.unref()

function shutdown(signal: string) {
  console.log(`${signal} recibido, cerrando…`)
  clearInterval(housekeeping)
  scheduler.stop()
  server.close(() => {
    db.$client.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
