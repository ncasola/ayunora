import { useState } from 'react'
import { useNavigate } from 'react-router'
import { NotificationSettings } from '../components/NotificationSettings'
import { PlanPicker, type PlanChoice } from '../components/PlanPicker'
import { PushCard } from '../components/PushCard'
import { Button, Card } from '../components/ui'
import { useSession, useUpdateSettings } from '../lib/queries'

/** Primera vez tras registrarse: plan por defecto, notificaciones y recordatorio. */
export function WelcomeScreen() {
  const { user, settings } = useSession()
  const updateSettings = useUpdateSettings()
  const navigate = useNavigate()
  const [choice, setChoice] = useState<PlanChoice>({
    plan: settings.defaultPlan,
    customGoalMinutes: settings.customGoalMinutes,
  })

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1 pt-2">
        <h1 className="text-2xl font-extrabold">¡Hola, {user.name}! 🌅</h1>
        <p className="text-ink/70 dark:text-brand-50/70">
          Tres cosas rápidas y listo. Todo se puede cambiar luego en Ajustes.
        </p>
      </header>

      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-bold tracking-wide text-brand-600 uppercase dark:text-brand-300">
            Paso 1
          </p>
          <h2 className="font-bold">¿Qué plan quieres seguir?</h2>
          <p className="text-sm text-ink/60 dark:text-brand-50/60">
            Si es tu primera vez, el 16:8 es el más llevadero.
          </p>
        </div>
        <PlanPicker
          value={choice}
          onChange={(next) => {
            setChoice(next)
            updateSettings.mutate({
              defaultPlan: next.plan,
              customGoalMinutes: next.customGoalMinutes,
            })
          }}
        />
      </Card>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-bold tracking-wide text-brand-600 uppercase dark:text-brand-300">
          Paso 2 · Para avisarte al terminar
        </p>
        <PushCard />
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-bold tracking-wide text-brand-600 uppercase dark:text-brand-300">
          Paso 3 · Qué avisos quieres
        </p>
        <NotificationSettings />
      </div>

      <Button onClick={() => navigate('/', { replace: true })}>¡Empezar!</Button>
    </div>
  )
}
