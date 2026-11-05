/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { ExpirationPlugin } from 'workbox-expiration'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import type { PushPayload } from '../shared/push'

declare const self: ServiceWorkerGlobalScope

// registerType 'autoUpdate': la versión nueva del SW toma el control en cuanto se instala.
self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA: cualquier navegación (salvo /api) se sirve con el index.html precacheado.
// En desarrollo el precache solo trae la raíz.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    allowlist: import.meta.env.DEV ? [/^\/$/] : undefined,
    denylist: [/^\/api\//],
  }),
)

// API: red primero y, si no hay conexión, la última respuesta guardada. Así el temporizador
// se ve aunque no haya red, porque se calcula en local a partir de `startedAt`.
// Solo se cachean respuestas 200. La caché se borra al cerrar sesión (ver useLogout).
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/api/') &&
    url.pathname !== '/api/health',
  new NetworkFirst({
    cacheName: 'api',
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  }),
)

self.addEventListener('push', (event) => {
  let payload: PushPayload = { title: 'Ayunora' }
  try {
    if (event.data) payload = { ...payload, ...(event.data.json() as Partial<PushPayload>) }
  } catch {
    payload.body = event.data?.text()
  }

  // En iOS hay que mostrar SIEMPRE una notificación por cada push recibido:
  // si no, el sistema puede revocar la suscripción.
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(
    (event.notification.data as { url?: string } | undefined)?.url ?? '/',
    self.location.origin,
  ).href

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows[0]
      if (existing) {
        await existing.focus()
        if (existing.url !== target) await existing.navigate(target).catch(() => undefined)
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})
