import { serve } from '@hono/node-server'
import { createApp } from './app'
import { openDb } from './db'
import { loadEnv } from './env'
import { createWebPushSender } from './push'

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
const app = createApp({ db, push: createWebPushSender(env), env })

const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
  console.log(`Ayunora escuchando en http://${info.address}:${info.port} (${env.NODE_ENV})`)
})

function shutdown(signal: string) {
  console.log(`${signal} recibido, cerrando…`)
  server.close(() => {
    db.$client.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
