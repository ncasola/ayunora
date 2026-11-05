import { isIos, isStandalone } from '../lib/push'

/** En iPhone las notificaciones solo funcionan con la app instalada en la pantalla de inicio. */
export function InstallBanner() {
  if (!isIos() || isStandalone()) return null
  return (
    <section className="rounded-3xl bg-brand-100 p-5 text-ink dark:bg-brand-700/30 dark:text-brand-50">
      <h2 className="mb-2 font-bold">📲 Instala Ayunora en tu iPhone</h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Pulsa <strong>Compartir</strong> en Safari (el cuadrado con la flecha hacia arriba).
        </li>
        <li>
          Elige <strong>«Añadir a pantalla de inicio»</strong>.
        </li>
        <li>Abre Ayunora desde el icono nuevo y entra con tu cuenta.</li>
      </ol>
      <p className="mt-2 text-xs opacity-70">
        Sin instalarla no te pueden llegar los avisos de fin de ayuno.
      </p>
    </section>
  )
}
