import { useEffect, useState } from 'react'

/**
 * Hora actual que se actualiza cada `intervalMs`. Al volver a primer plano se actualiza al
 * momento: iOS congela los timers con la app en segundo plano, y por eso el temporizador
 * siempre se calcula como `now - startedAt`, nunca sumando ticks.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = window.setInterval(tick, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])

  return now
}
