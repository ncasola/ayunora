/**
 * Limitador de ventana fija en memoria. Con un único proceso y dos usuarios es suficiente.
 * Se reinicia con el servicio, lo cual es aceptable para frenar fuerza bruta.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Devuelve `true` si la petición se permite. */
  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      this.prune(now)
      return true
    }
    entry.count++
    return entry.count <= this.max
  }

  reset(key: string) {
    this.hits.delete(key)
  }

  private prune(now: number) {
    if (this.hits.size < 1000) return
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k)
  }
}
