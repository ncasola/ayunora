import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Si una pantalla revienta, se muestra un mensaje con un botón para recargar en lugar de
 * una pantalla en blanco. En una PWA instalada no hay barra del navegador para recargar.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ui] error no controlado', error, info.componentStack)
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="safe-area mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 text-center">
        <span className="text-5xl" aria-hidden>
          😵‍💫
        </span>
        <p className="font-bold">Algo ha fallado</p>
        <p className="text-sm text-ink/60 dark:text-brand-50/60">
          Tus datos están a salvo en el servidor. Prueba a recargar la app.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-12 rounded-full bg-brand-500 px-6 py-3 font-semibold text-white"
        >
          Recargar
        </button>
      </main>
    )
  }
}
