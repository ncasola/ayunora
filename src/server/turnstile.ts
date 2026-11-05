// Verificación de Cloudflare Turnstile en el servidor.
// El token del navegador no prueba nada por sí solo: hay que canjearlo en siteverify, y solo
// se puede canjear una vez, así que un token reutilizado se rechaza. Además se comprueba que
// el token se emitió para la acción esperada y para nuestro dominio, para que no valga un token
// sacado de otra página con la misma clave de sitio.

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
export const TURNSTILE_ACTIONS = ['login', 'register'] as const
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[number]

const MAX_TOKEN_LENGTH = 2048
const TIMEOUT_MS = 10_000

export type TurnstileResult =
  | { ok: true }
  | {
      ok: false
      /** `unavailable`: no se pudo consultar a Cloudflare. El resto: el token no vale. */
      reason: 'missing' | 'invalid' | 'action' | 'hostname' | 'unavailable'
      errorCodes?: string[]
    }

export interface TurnstileVerifier {
  verify(token: unknown, action: TurnstileAction, remoteIp: string | null): Promise<TurnstileResult>
}

type SiteverifyResponse = {
  success?: boolean
  action?: string
  hostname?: string
  'error-codes'?: string[]
  metadata?: { result_with_testing_key?: boolean }
}

/** Claves secretas de prueba públicas de Cloudflare (1x… pasa, 2x… falla, 3x… token caducado). */
export function isTestingSecret(secret: string): boolean {
  return /^[123]x0+AA$/.test(secret)
}

export function createTurnstileVerifier(opts: {
  secret: string
  hostnames: string[]
  /**
   * Solo fuera de producción: las claves de prueba no devuelven `action`, así que con ellas no
   * se puede comprobar. En producción, una respuesta de prueba se rechaza siempre.
   */
  allowTestingKeys?: boolean
  fetch?: typeof fetch
}): TurnstileVerifier {
  const hostnames = new Set(opts.hostnames)
  const doFetch = opts.fetch ?? fetch

  return {
    async verify(token, action, remoteIp) {
      if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
        return { ok: false, reason: 'missing' }
      }

      const body = new URLSearchParams({ secret: opts.secret, response: token })
      if (remoteIp && remoteIp !== 'local') body.set('remoteip', remoteIp)

      let result: SiteverifyResponse
      try {
        const res = await doFetch(SITEVERIFY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!res.ok) return { ok: false, reason: 'unavailable' }
        result = (await res.json()) as SiteverifyResponse
      } catch {
        // Fallo cerrado: si no se puede verificar, no se deja pasar.
        return { ok: false, reason: 'unavailable' }
      }

      if (!result.success) {
        return { ok: false, reason: 'invalid', errorCodes: result['error-codes'] }
      }
      const testing = result.metadata?.result_with_testing_key === true
      if (testing && !opts.allowTestingKeys) return { ok: false, reason: 'invalid' }
      if (!testing && result.action !== action) return { ok: false, reason: 'action' }
      if (!result.hostname || !hostnames.has(result.hostname)) {
        return { ok: false, reason: 'hostname' }
      }
      return { ok: true }
    },
  }
}
