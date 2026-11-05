import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Sin red se ve lo último guardado (el SW cachea la API), pero los cambios necesitan conexión. */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
  if (online) return null
  return (
    <div
      role="status"
      className="rounded-2xl bg-ink px-4 py-3 text-sm text-brand-50 dark:bg-brand-50 dark:text-ink"
    >
      📡 <strong>Sin conexión.</strong> Ves los últimos datos guardados. Para empezar, terminar o
      editar hace falta red.
    </div>
  )
}
