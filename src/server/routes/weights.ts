import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { wallTimeAt } from '../../shared/tz'
import { addDays, isValidDay, putWeightSchema, type WeightDto } from '../../shared/weights'
import { apiError, readJson, requireAuth, type AppEnv } from '../context'
import { weights, type WeightRow } from '../db/schema'
import type { AppDeps } from '../deps'

const toDto = (w: WeightRow): WeightDto => ({ day: w.day, kg: w.kg, note: w.note })

function todayIn(timeZone: string, now: number) {
  const w = wallTimeAt(now, timeZone)
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`
}

export function weightRoutes({ db, now }: AppDeps) {
  return (
    new Hono<AppEnv>()
      .use('*', requireAuth)

      // Todos los registros, del más antiguo al más reciente. Para dos personas pesándose
      // como mucho una vez al día, el volumen no justifica paginar.
      .get('/', (c) => {
        const rows = db
          .select()
          .from(weights)
          .where(eq(weights.userId, c.get('user')!.id))
          .orderBy(asc(weights.day))
          .all()
        return c.json(rows.map(toDto))
      })

      // Crea o sobrescribe el registro de ese día.
      .put('/:day', async (c) => {
        const day = c.req.param('day')
        if (!isValidDay(day)) return apiError(c, 400, 'validation_error')
        const user = c.get('user')!
        const t = now()
        // Un día de margen: el móvil puede ir ya por mañana si el usuario cambió de zona.
        if (day > addDays(todayIn(user.timezone, t), 1))
          return apiError(c, 400, 'invalid_time_range')

        const body = await readJson(c, putWeightSchema)
        if ('response' in body) return body.response
        const { kg, note } = body.data

        const row = db
          .insert(weights)
          .values({
            userId: user.id,
            day,
            kg,
            note,
            createdAt: new Date(t),
            updatedAt: new Date(t),
          })
          .onConflictDoUpdate({
            target: [weights.userId, weights.day],
            set: { kg, note, updatedAt: new Date(t) },
          })
          .returning()
          .get()
        return c.json(toDto(row))
      })

      .delete('/:day', (c) => {
        const day = c.req.param('day')
        if (!isValidDay(day)) return apiError(c, 400, 'validation_error')
        const res = db
          .delete(weights)
          .where(and(eq(weights.userId, c.get('user')!.id), eq(weights.day, day)))
          .run()
        if (res.changes === 0) return apiError(c, 404, 'not_found')
        return c.json({ ok: true })
      })
  )
}
