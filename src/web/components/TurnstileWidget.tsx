import { useEffect, useRef } from 'react'

// Widget de Cloudflare Turnstile en modo explícito. Cada token solo se puede canjear una vez,
// así que tras cada intento de login o registro hay que pedir uno nuevo: el padre lo indica
// cambiando `resetKey`.

type RenderOptions = {
  sitekey: string
  action: string
  theme: 'auto' | 'light' | 'dark'
  appearance: 'always' | 'execute' | 'interaction-only'
  language: string
  'refresh-expired': 'auto' | 'manual' | 'never'
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
}

type TurnstileApi = {
  render: (el: HTMLElement, opts: RenderOptions) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | undefined

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile no cargó'))
    script.onerror = () => {
      loading = undefined
      reject(new Error('No se pudo cargar Turnstile'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export function TurnstileWidget({
  siteKey,
  action,
  resetKey,
  onToken,
  onError,
}: {
  siteKey: string
  action: 'login' | 'register'
  /** Al cambiar, se descarta el token actual y se pide uno nuevo. */
  resetKey: number
  onToken: (token: string | null) => void
  onError: (message: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  // Los callbacks se leen por ref: así cambiarlos no vuelve a montar el widget.
  const handlers = useRef({ onToken, onError })
  useEffect(() => {
    handlers.current = { onToken, onError }
  })

  useEffect(() => {
    let cancelled = false
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !container.current) return
        widgetId.current = ts.render(container.current, {
          sitekey: siteKey,
          action,
          theme: 'auto',
          // Solo se ve si Cloudflare necesita que la persona interactúe. Lo normal es que pase solo.
          appearance: 'interaction-only',
          language: 'es',
          'refresh-expired': 'auto',
          callback: (token) => handlers.current.onToken(token),
          'expired-callback': () => handlers.current.onToken(null),
          'error-callback': () => {
            handlers.current.onToken(null)
            handlers.current.onError(
              'No se pudo comprobar que no eres un robot. Recarga la página.',
            )
          },
        })
      })
      .catch(() => handlers.current.onError('No se pudo cargar la verificación. ¿Tienes conexión?'))
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [siteKey, action])

  useEffect(() => {
    if (resetKey === 0 || !widgetId.current || !window.turnstile) return
    handlers.current.onToken(null)
    window.turnstile.reset(widgetId.current)
  }, [resetKey])

  return <div ref={container} className="flex justify-center empty:hidden" />
}
