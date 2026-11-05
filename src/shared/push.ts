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

/** Forma de `PushSubscription.toJSON()` en el navegador. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>
