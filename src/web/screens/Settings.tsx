import { useMemo, useState } from 'react'
import { PlanPicker, type PlanChoice } from '../components/PlanPicker'
import { PushCard } from '../components/PushCard'
import { Button, Card, ErrorText, Field } from '../components/ui'
import { errorMessage } from '../lib/api'
import { deviceTimeZone } from '../lib/format'
import { useLogout, useSession, useUpdateMe, useUpdateSettings } from '../lib/queries'

export function SettingsScreen() {
  const { user, settings } = useSession()
  const updateMe = useUpdateMe()
  const updateSettings = useUpdateSettings()
  const logout = useLogout()
  const [name, setName] = useState(user.name)
  const [choice, setChoice] = useState<PlanChoice>({
    plan: settings.defaultPlan,
    customGoalMinutes: settings.customGoalMinutes,
  })

  const zones = useMemo(() => Intl.supportedValuesOf('timeZone'), [])
  const deviceTz = deviceTimeZone()

  const saveName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== user.name) updateMe.mutate({ name: trimmed })
  }

  const changePlan = (next: PlanChoice) => {
    setChoice(next)
    updateSettings.mutate({ defaultPlan: next.plan, customGoalMinutes: next.customGoalMinutes })
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-extrabold">Ajustes</h1>

      <Card className="flex flex-col gap-4">
        <h2 className="font-bold">Perfil</h2>
        <Field
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Zona horaria
          <select
            value={user.timezone}
            onChange={(e) => updateMe.mutate({ timezone: e.target.value })}
            className="min-h-12 rounded-2xl border border-brand-200 bg-white px-3 text-base text-ink dark:border-white/10 dark:bg-white/10 dark:text-brand-50"
          >
            {(zones.includes(user.timezone) ? zones : [user.timezone, ...zones]).map((z) => (
              <option key={z} value={z}>
                {z.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        {deviceTz !== user.timezone && (
          <Button variant="ghost" onClick={() => updateMe.mutate({ timezone: deviceTz })}>
            Usar la de este dispositivo ({deviceTz.replaceAll('_', ' ')})
          </Button>
        )}
        <ErrorText>{updateMe.error ? errorMessage(updateMe.error) : undefined}</ErrorText>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="font-bold">Plan por defecto</h2>
          <p className="text-sm text-ink/60 dark:text-brand-50/60">
            El que aparece seleccionado al empezar un ayuno.
          </p>
        </div>
        <PlanPicker value={choice} onChange={changePlan} />
        <ErrorText>
          {updateSettings.error ? errorMessage(updateSettings.error) : undefined}
        </ErrorText>
      </Card>

      <PushCard />

      <Button variant="secondary" onClick={() => logout.mutate()} busy={logout.isPending}>
        Cerrar sesión
      </Button>

      <p className="px-2 pb-2 text-center text-xs text-ink/50 dark:text-brand-50/50">
        Sesión iniciada como {user.email}.
        <br />
        La información sobre las fases es orientativa y no sustituye el consejo médico.
      </p>
    </div>
  )
}
