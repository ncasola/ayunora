import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  ActiveFastDto,
  FastDto,
  LoginInput,
  MeDto,
  RegisterInput,
  SettingsDto,
  StartFastInput,
  StopFastInput,
  UpdateFastInput,
  UpdateMeInput,
  UpdateSettingsInput,
} from '../../shared/api'
import { api, ApiError } from './api'

export const keys = {
  me: ['me'] as const,
  activeFast: ['fasts', 'active'] as const,
}

/** `null` = sin sesión. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<MeDto>('/me')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}

/** Datos del usuario con sesión. Solo se usa dentro de las pantallas privadas. */
export function useSession(): MeDto {
  const { data } = useMe()
  if (!data) throw new Error('useSession fuera de una pantalla privada')
  return data
}

/**
 * Cambio de sesión: borra los datos del usuario anterior y fija `me`.
 * Ojo: no usar `qc.clear()`. Elimina también la consulta `me` a la que está suscrito
 * `useMe`, y el `setQueryData` posterior crearía otra que nadie observa: la pantalla no
 * cambiaría.
 */
function switchSession(qc: QueryClient, me: MeDto | null) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== keys.me[0] })
  qc.setQueryData(keys.me, me)
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) => api<MeDto>('/auth/login', { method: 'POST', body: input }),
    onSuccess: (me) => switchSession(qc, me),
  })
}

export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api<MeDto>('/auth/register', { method: 'POST', body: input }),
    onSuccess: (me) => switchSession(qc, me),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api('/auth/logout', { method: 'POST' })
      // Borra las respuestas de la API que guardó el service worker para usar sin red.
      if ('caches' in window) await caches.delete('api').catch(() => undefined)
    },
    onSettled: () => switchSession(qc, null),
  })
}

export function useUpdateMe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateMeInput) => api<MeDto>('/me', { method: 'PATCH', body: input }),
    onSuccess: (me) => qc.setQueryData(keys.me, me),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) =>
      api<SettingsDto>('/settings', { method: 'PATCH', body: input }),
    onSuccess: (settings) =>
      qc.setQueryData<MeDto | null>(keys.me, (me) => (me ? { ...me, settings } : me)),
  })
}

export function useActiveFast() {
  return useQuery({
    queryKey: keys.activeFast,
    queryFn: () => api<ActiveFastDto>('/fasts/active'),
  })
}

export function useStartFast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: StartFastInput) => api<FastDto>('/fasts', { method: 'POST', body: input }),
    onSuccess: (fast) =>
      qc.setQueryData<ActiveFastDto>(keys.activeFast, (prev) => ({
        active: fast,
        lastEndedAt: prev?.lastEndedAt ?? null,
      })),
    onError: () => qc.invalidateQueries({ queryKey: keys.activeFast }),
  })
}

export function useStopFast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: StopFastInput & { id: number }) =>
      api<FastDto>(`/fasts/${id}/stop`, { method: 'POST', body: input }),
    onSuccess: (fast) =>
      qc.setQueryData<ActiveFastDto>(keys.activeFast, {
        active: null,
        lastEndedAt: fast.endedAt,
      }),
    onError: () => qc.invalidateQueries({ queryKey: keys.activeFast }),
  })
}

export function useUpdateFast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateFastInput & { id: number }) =>
      api<FastDto>(`/fasts/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (fast) =>
      qc.setQueryData<ActiveFastDto>(keys.activeFast, (prev) =>
        prev?.active?.id === fast.id ? { ...prev, active: fast } : prev,
      ),
  })
}
