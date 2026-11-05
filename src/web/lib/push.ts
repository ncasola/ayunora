import type { PushSubscriptionInput } from '../../shared/push'
import { api } from './api'

export type PushStatus =
  | 'unsupported' // navegador sin Push API (p. ej. Safari iOS sin instalar la app)
  | 'denied'
  | 'default' // aún no se ha pedido permiso
  | 'granted-unsubscribed'
  | 'subscribed'

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'default'
  // getRegistration() no se queda esperando como `ready` si el SW no llegó a instalarse.
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg?.active ? await reg.pushManager.getSubscription() : null
  return sub ? 'subscribed' : 'granted-unsubscribed'
}

/**
 * `navigator.serviceWorker.ready` no se resuelve nunca si el SW falla al instalarse.
 * Con límite de tiempo, el usuario ve un error en lugar de un botón colgado.
 */
function readyRegistration(timeoutMs = 10_000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'La app aún no está lista para recibir avisos. Ciérrala del todo, vuelve a abrirla e inténtalo de nuevo.',
            ),
          ),
        timeoutMs,
      ),
    ),
  ])
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * Pide permiso, suscribe el dispositivo y lo registra en el servidor. Hay que llamarla
 * directamente desde un toque del usuario: iOS solo muestra el diálogo de permiso dentro
 * de un gesto, así que `requestPermission` va antes de cualquier otro `await`.
 * La clave pública se pide antes, al montar la pantalla.
 */
export async function enablePush(publicKey: string): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('No has dado permiso para las notificaciones.')

  const reg = await readyRegistration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }))
  await api('/push/subscriptions', {
    method: 'POST',
    body: sub.toJSON() as PushSubscriptionInput,
  })
}

export async function sendTestPush() {
  return api<{ sent: number; removed: number; failed: number }>('/push/test', { method: 'POST' })
}
