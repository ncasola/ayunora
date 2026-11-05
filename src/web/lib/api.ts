import type { ApiErrorCode } from '../../shared/api'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'internal_error' | 'network_error' | 'unknown_error',
    readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(`${status} ${code}`)
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network_error')
  }
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const { error, details } = data as { error?: ApiError['code']; details?: ApiError['details'] }
    throw new ApiError(res.status, error ?? 'unknown_error', details)
  }
  return data as T
}

const messages: Partial<Record<ApiError['code'], string>> = {
  network_error: 'Sin conexión. Inténtalo de nuevo cuando tengas red.',
  unauthorized: 'Tu sesión ha caducado. Vuelve a entrar.',
  rate_limited: 'Demasiados intentos. Espera unos minutos.',
  invalid_credentials: 'Email o contraseña incorrectos.',
  captcha_failed: 'No se pudo comprobar que no eres un robot. Inténtalo de nuevo.',
  captcha_unavailable: 'Ahora mismo no se puede hacer la verificación. Inténtalo en unos minutos.',
  invalid_invite: 'El código de invitación no es correcto.',
  email_taken: 'Ya existe una cuenta con ese email.',
  fast_already_active: 'Ya tienes un ayuno en curso.',
  fast_not_active: 'Ese ayuno ya había terminado.',
  fast_overlap: 'Se solapa con otro ayuno que ya tienes registrado.',
  fast_too_long: 'Un ayuno no puede durar más de 7 días.',
  invalid_time_range: 'Esa hora no es válida.',
  not_found: 'No se ha encontrado.',
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'validation_error' && err.details?.[0]) return err.details[0].message
    return messages[err.code] ?? 'Algo ha fallado. Inténtalo de nuevo.'
  }
  if (err instanceof Error) return err.message
  return 'Algo ha fallado. Inténtalo de nuevo.'
}
