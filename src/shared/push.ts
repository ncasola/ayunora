import { z } from 'zod'

/** Contenido que el servidor envía en cada push y que pinta el service worker. */
export const pushPayloadSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  /** Ruta de la app que se abre al tocar la notificación. */
  url: z.string().optional(),
  /** Las notificaciones con el mismo tag se sustituyen en lugar de acumularse. */
  tag: z.string().optional(),
})
export type PushPayload = z.infer<typeof pushPayloadSchema>

/**
 * Servicios de push de los navegadores. El servidor hace un POST al `endpoint` de cada
 * suscripción: si se aceptara cualquier URL, un usuario podría usar el servidor para lanzar
 * peticiones a servicios internos (SSRF). Solo se admite HTTPS hacia estos dominios.
 */
const PUSH_SERVICE_HOSTS = [
  'web.push.apple.com', // Safari / iOS
  'fcm.googleapis.com', // Chrome, Edge (Android) y la mayoría de Chromium
  'android.googleapis.com', // endpoints antiguos de Chrome
  'updates.push.services.mozilla.com', // Firefox
]
const PUSH_SERVICE_SUFFIXES = ['.push.apple.com', '.notify.windows.com'] // Edge en Windows (WNS)

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return PUSH_SERVICE_HOSTS.includes(host) || PUSH_SERVICE_SUFFIXES.some((s) => host.endsWith(s))
}

/** Forma de `PushSubscription.toJSON()` en el navegador. */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .url()
    .max(2048)
    .refine(isAllowedPushEndpoint, 'Servicio de notificaciones no admitido'),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
})
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>
