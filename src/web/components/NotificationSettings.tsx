import { useState } from 'react'
import type { UpdateSettingsInput } from '../../shared/api'
import { PRE_END_OPTIONS } from '../../shared/schedule'
import { errorMessage } from '../lib/api'
import { useSession, useUpdateSettings } from '../lib/queries'
import { Card, ErrorText, Toggle } from './ui'

/** Qué avisos quiere recibir cada usuario. Los cambios reprograman los avisos en el servidor. */
export function NotificationSettings() {
  const { settings } = useSession()
  const update = useUpdateSettings()
  // Hora del recordatorio en local, para no guardar a cada tecla.
  const [reminderTime, setReminderTime] = useState(settings.reminderTime)

  const save = (patch: UpdateSettingsInput) => update.mutate(patch)

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="font-bold">Avisos</h2>
        <p className="text-sm text-ink/60 dark:text-brand-50/60">
          Llegan aunque tengas la app cerrada.
        </p>
      </div>

      <Toggle
        label="Fin del ayuno"
        description="Cuando cumples tu objetivo."
        checked={settings.notifyGoal}
        onChange={(v) => save({ notifyGoal: v })}
      />

      <div className="flex flex-col gap-3">
        <Toggle
          label="Aviso previo"
          description="Un poco antes de terminar."
          checked={settings.notifyPreEnd}
          onChange={(v) => save({ notifyPreEnd: v })}
        />
        {settings.notifyPreEnd && (
          <div className="flex gap-2" role="radiogroup" aria-label="Antelación del aviso previo">
            {PRE_END_OPTIONS.map((min) => {
              const selected = settings.preEndMinutes === min
              return (
                <button
                  key={min}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => save({ preEndMinutes: min })}
                  className={`min-h-11 flex-1 rounded-full text-sm font-semibold transition ${
                    selected
                      ? 'bg-brand-500 text-white'
                      : 'bg-brand-100 text-brand-700 dark:bg-white/10 dark:text-brand-200'
                  }`}
                >
                  {min === 60 ? '1 h antes' : `${min} min antes`}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <Toggle
        label="Hitos del ayuno"
        description="Al entrar en cada fase: quema de grasa, cetosis…"
        checked={settings.notifyMilestones}
        onChange={(v) => save({ notifyMilestones: v })}
      />

      <div className="flex flex-col gap-3">
        <Toggle
          label="Recordatorio diario"
          description="Para empezar el ayuno cada día. No suena si ya estás ayunando."
          checked={settings.reminderEnabled}
          onChange={(v) => save({ reminderEnabled: v, reminderTime })}
        />
        {settings.reminderEnabled && (
          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            A las
            <input
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              onBlur={() => {
                if (reminderTime && reminderTime !== settings.reminderTime) {
                  save({ reminderTime })
                }
              }}
              className="min-h-11 rounded-2xl border border-brand-200 bg-white px-4 text-base text-ink dark:border-white/10 dark:bg-white/10 dark:text-brand-50"
            />
          </label>
        )}
      </div>

      <ErrorText>{update.error ? errorMessage(update.error) : undefined}</ErrorText>
    </Card>
  )
}
