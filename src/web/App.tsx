import { useEffect, useState } from 'react'
import { api, ApiError } from './lib/api'
import { getPushStatus, isIos, isStandalone, subscribeToPush, type PushStatus } from './lib/push'

// Pantalla provisional del M0: solo sirve para validar la instalación y el push en el iPhone.
// En el M1 se sustituye por la app real (login + temporizador).

const TOKEN_KEY = 'ayunora.setupToken'

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

const statusText: Record<PushStatus, string> = {
  unsupported: 'Este navegador no admite notificaciones push',
  denied: 'Notificaciones bloqueadas. Actívalas en Ajustes › Notificaciones › Ayunora',
  default: 'Notificaciones sin activar',
  'granted-unsubscribed': 'Permiso concedido, falta suscribir este dispositivo',
  subscribed: 'Notificaciones activadas en este dispositivo ✓',
}

export function App() {
  const [publicKey, setPublicKey] = useState<string>()
  const [status, setStatus] = useState<PushStatus>()
  const [token, setToken] = useState(readToken)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const standalone = isStandalone()

  useEffect(() => {
    api<{ publicKey: string }>('/push/public-key')
      .then((r) => setPublicKey(r.publicKey))
      .catch(() => setMessage('No se pudo contactar con el servidor'))
    void getPushStatus().then(setStatus)
  }, [])

  function saveToken(value: string) {
    setToken(value)
    try {
      localStorage.setItem(TOKEN_KEY, value)
    } catch {
      // Sin almacenamiento: el token vive solo en memoria.
    }
  }

  async function activate() {
    if (!publicKey) return
    setBusy(true)
    setMessage(undefined)
    try {
      const subscription = await subscribeToPush(publicKey)
      await api('/push/subscriptions', {
        method: 'POST',
        body: subscription,
        headers: { 'x-setup-token': token },
      })
      setMessage('Dispositivo suscrito. Prueba a enviar una notificación.')
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setStatus(await getPushStatus())
      setBusy(false)
    }
  }

  async function sendTest() {
    setBusy(true)
    setMessage(undefined)
    try {
      const r = await api<{ sent: number; removed: number; failed: number }>('/push/test', {
        method: 'POST',
        headers: { 'x-setup-token': token },
      })
      setMessage(
        `Enviadas: ${r.sent} · Eliminadas: ${r.removed} · Fallidas: ${r.failed}. ` +
          'Cierra la app para verla llegar.',
      )
    } catch (err) {
      setMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="safe-area mx-auto flex min-h-dvh max-w-md flex-col gap-6">
      <header className="flex items-center gap-3 pt-4">
        <img src="/icon.svg" alt="" className="size-12 rounded-2xl" />
        <div>
          <h1 className="text-2xl font-bold">Ayunora</h1>
          <p className="text-sm opacity-70">Prueba de instalación y notificaciones</p>
        </div>
      </header>

      {!standalone && isIos() && (
        <section className="rounded-3xl bg-brand-100 p-5 text-ink">
          <h2 className="mb-2 font-semibold">Instala la app primero</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Pulsa el botón Compartir de Safari (el cuadrado con la flecha).</li>
            <li>Elige «Añadir a pantalla de inicio».</li>
            <li>Abre Ayunora desde el icono nuevo.</li>
          </ol>
          <p className="mt-2 text-xs opacity-70">
            En iPhone las notificaciones solo funcionan con la app instalada.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-3xl bg-white/70 p-5 shadow-sm dark:bg-white/5">
        <p className="text-sm">{status ? statusText[status] : 'Comprobando…'}</p>

        <label className="flex flex-col gap-1 text-sm">
          Código de configuración
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => saveToken(e.target.value)}
            className="rounded-xl border border-brand-200 bg-white px-3 py-2 text-ink"
          />
        </label>

        <button
          type="button"
          onClick={activate}
          disabled={busy || !publicKey || !token || status === 'unsupported'}
          className="rounded-full bg-brand-500 px-5 py-3 font-semibold text-white disabled:opacity-40"
        >
          Activar notificaciones
        </button>
        <button
          type="button"
          onClick={sendTest}
          disabled={busy || !token}
          className="rounded-full border-2 border-brand-500 px-5 py-3 font-semibold text-brand-600 disabled:opacity-40"
        >
          Enviar notificación de prueba
        </button>

        {message && <p className="text-sm">{message}</p>}
      </section>
    </main>
  )
}

function errorText(err: unknown) {
  if (err instanceof ApiError && err.status === 401) return 'Código de configuración incorrecto'
  if (err instanceof Error) return err.message
  return 'Error desconocido'
}
