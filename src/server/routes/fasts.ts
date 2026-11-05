import { and, desc, eq, gt, isNotNull, isNull, lt, ne, or } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import {
  listFastsQuerySchema,
  manualFastSchema,
  MAX_FAST_MS,
  startFastSchema,
  stopFastSchema,
  updateFastSchema,
  type ActiveFastDto,
  type FastDto,
  type FastPageDto,
} from '../../shared/api'
import { computeStats } from '../../shared/stats'
import { apiError, readJson, requireAuth, type AppEnv } from '../context'
import type { Db } from '../db'
import { fasts, type FastRow } from '../db/schema'
import { isUniqueViolation, type AppDeps } from '../deps'
import { findActiveFast } from '../repo'
import { cancelFastJobs, scheduleFastJobs } from '../scheduler'

/** Margen por desajustes de reloj entre el móvil y el servidor. */
const CLOCK_SKEW_MS = 60 * 1000
/** Hasta dónde se puede retrasar el inicio con «Empecé antes…». */
const MAX_BACKDATE_MS = 72 * 60 * 60 * 1000

export function toFastDto(f: FastRow): FastDto {
  return {
    id: f.id,
    startedAt: f.startedAt.getTime(),
    endedAt: f.endedAt?.getTime() ?? null,
    goalMinutes: f.goalMinutes,
    plan: f.plan,
    note: f.note,
  }
}

function lastEndedAt(db: Db, userId: number) {
  const row = db
    .select({ endedAt: fasts.endedAt })
    .from(fasts)
    .where(and(eq(fasts.userId, userId), isNotNull(fasts.endedAt)))
    .orderBy(desc(fasts.endedAt))
    .limit(1)
    .get()
  return row?.endedAt?.getTime() ?? null
}

/**
 * ¿Hay otro ayuno del usuario que se solape con [start, end)? `end = null` es un ayuno
 * abierto (en curso). Los extremos que se tocan (uno acaba justo cuando empieza otro) no
 * cuentan como solape.
 */
function overlaps(db: Db, userId: number, start: number, end: number | null, excludeId?: number) {
  const row = db
    .select({ id: fasts.id })
    .from(fasts)
    .where(
      and(
        eq(fasts.userId, userId),
        excludeId !== undefined ? ne(fasts.id, excludeId) : undefined,
        end !== null ? lt(fasts.startedAt, new Date(end)) : undefined,
        or(isNull(fasts.endedAt), gt(fasts.endedAt, new Date(start))),
      ),
    )
    .limit(1)
    .get()
  return row !== undefined
}

/** Valida un intervalo de ayuno. Devuelve un código de error, o null si es válido. */
function checkRange(start: number, end: number | null, now: number) {
  if (start > now + CLOCK_SKEW_MS) return 'invalid_time_range' as const
  if (end !== null) {
    if (end <= start || end > now + CLOCK_SKEW_MS) return 'invalid_time_range' as const
    if (end - start > MAX_FAST_MS) return 'fast_too_long' as const
  }
  return null
}

function ownFast(c: Context<AppEnv>, db: Db) {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return undefined
  return db
    .select()
    .from(fasts)
    .where(and(eq(fasts.id, id), eq(fasts.userId, c.get('user')!.id)))
    .get()
}

export function fastRoutes({ db, now }: AppDeps) {
  return (
    new Hono<AppEnv>()
      .use('*', requireAuth)

      .get('/active', (c) => {
        const userId = c.get('user')!.id
        const active = findActiveFast(db, userId)
        const dto: ActiveFastDto = {
          active: active ? toFastDto(active) : null,
          lastEndedAt: lastEndedAt(db, userId),
        }
        return c.json(dto)
      })

      // Historial: solo ayunos terminados, paginado por fecha de inicio.
      .get('/', (c) => {
        const parsed = listFastsQuerySchema.safeParse(c.req.query())
        if (!parsed.success) return apiError(c, 400, 'validation_error')
        const { before, limit } = parsed.data
        const rows = db
          .select()
          .from(fasts)
          .where(
            and(
              eq(fasts.userId, c.get('user')!.id),
              isNotNull(fasts.endedAt),
              before !== undefined ? lt(fasts.startedAt, new Date(before)) : undefined,
            ),
          )
          .orderBy(desc(fasts.startedAt))
          .limit(limit + 1)
          .all()
        const items = rows.slice(0, limit).map(toFastDto)
        const dto: FastPageDto = {
          items,
          nextBefore: rows.length > limit ? items.at(-1)!.startedAt : null,
        }
        return c.json(dto)
      })

      .get('/stats', (c) => {
        const user = c.get('user')!
        const ended = db
          .select({
            startedAt: fasts.startedAt,
            endedAt: fasts.endedAt,
            goalMinutes: fasts.goalMinutes,
          })
          .from(fasts)
          .where(and(eq(fasts.userId, user.id), isNotNull(fasts.endedAt)))
          .all()
          .map((f) => ({
            startedAt: f.startedAt.getTime(),
            endedAt: f.endedAt!.getTime(),
            goalMinutes: f.goalMinutes,
          }))
        return c.json(computeStats(ended, user.timezone, now()))
      })

      .post('/', async (c) => {
        const body = await readJson(c, startFastSchema)
        if ('response' in body) return body.response
        const userId = c.get('user')!.id
        const t = now()

        if (findActiveFast(db, userId)) return apiError(c, 409, 'fast_already_active')

        const startedAt = body.data.startedAt ?? t
        if (startedAt > t + CLOCK_SKEW_MS || startedAt < t - MAX_BACKDATE_MS) {
          return apiError(c, 400, 'invalid_time_range')
        }
        if (overlaps(db, userId, startedAt, null)) return apiError(c, 409, 'fast_overlap')

        try {
          const row = db
            .insert(fasts)
            .values({
              userId,
              startedAt: new Date(startedAt),
              goalMinutes: body.data.goalMinutes,
              plan: body.data.plan,
              createdAt: new Date(t),
              updatedAt: new Date(t),
            })
            .returning()
            .get()
          scheduleFastJobs(db, row, t)
          return c.json(toFastDto(row), 201)
        } catch (err) {
          // Dos peticiones simultáneas: el índice único parcial frena la segunda.
          if (isUniqueViolation(err)) return apiError(c, 409, 'fast_already_active')
          throw err
        }
      })

      .post('/manual', async (c) => {
        const body = await readJson(c, manualFastSchema)
        if ('response' in body) return body.response
        const userId = c.get('user')!.id
        const t = now()
        const { startedAt, endedAt, plan, goalMinutes, note } = body.data

        const rangeError = checkRange(startedAt, endedAt, t)
        if (rangeError) return apiError(c, 400, rangeError)
        if (overlaps(db, userId, startedAt, endedAt)) return apiError(c, 409, 'fast_overlap')

        const row = db
          .insert(fasts)
          .values({
            userId,
            startedAt: new Date(startedAt),
            endedAt: new Date(endedAt),
            plan,
            goalMinutes,
            note: note ?? null,
            createdAt: new Date(t),
            updatedAt: new Date(t),
          })
          .returning()
          .get()
        return c.json(toFastDto(row), 201)
      })

      .post('/:id/stop', async (c) => {
        const body = await readJson(c, stopFastSchema)
        if ('response' in body) return body.response
        const fast = ownFast(c, db)
        if (!fast) return apiError(c, 404, 'not_found')
        if (fast.endedAt) return apiError(c, 409, 'fast_not_active')

        const t = now()
        const endedAt = body.data.endedAt ?? t
        const rangeError = checkRange(fast.startedAt.getTime(), endedAt, t)
        if (rangeError) return apiError(c, 400, rangeError)

        const row = db
          .update(fasts)
          .set({ endedAt: new Date(endedAt), updatedAt: new Date(t) })
          .where(eq(fasts.id, fast.id))
          .returning()
          .get()!
        cancelFastJobs(db, fast.id)
        return c.json(toFastDto(row))
      })

      .patch('/:id', async (c) => {
        const body = await readJson(c, updateFastSchema)
        if ('response' in body) return body.response
        const fast = ownFast(c, db)
        if (!fast) return apiError(c, 404, 'not_found')

        const t = now()
        const { startedAt, endedAt, plan, goalMinutes, note } = body.data
        // El ayuno en curso se termina con /stop. Aquí no se le puede poner fin.
        if (endedAt !== undefined && !fast.endedAt) return apiError(c, 409, 'fast_not_active')

        if (startedAt !== undefined || endedAt !== undefined) {
          const start = startedAt ?? fast.startedAt.getTime()
          const end = endedAt ?? fast.endedAt?.getTime() ?? null
          const rangeError = checkRange(start, end, t)
          if (rangeError) return apiError(c, 400, rangeError)
          if (overlaps(db, fast.userId, start, end, fast.id))
            return apiError(c, 409, 'fast_overlap')
        }

        const row = db
          .update(fasts)
          .set({
            ...(startedAt !== undefined && { startedAt: new Date(startedAt) }),
            ...(endedAt !== undefined && { endedAt: new Date(endedAt) }),
            ...(plan !== undefined && { plan }),
            ...(goalMinutes !== undefined && { goalMinutes }),
            ...(note !== undefined && { note }),
            updatedAt: new Date(t),
          })
          .where(eq(fasts.id, fast.id))
          .returning()
          .get()!
        // Cambiar el inicio o el objetivo mueve todos los avisos del ayuno en curso.
        if (!row.endedAt && (startedAt !== undefined || goalMinutes !== undefined)) {
          scheduleFastJobs(db, row, t)
        }
        return c.json(toFastDto(row))
      })

      .delete('/:id', (c) => {
        const fast = ownFast(c, db)
        if (!fast) return apiError(c, 404, 'not_found')
        // Sus avisos pendientes se borran en cascada (FK de notification_jobs).
        db.delete(fasts).where(eq(fasts.id, fast.id)).run()
        return c.json({ ok: true })
      })
  )
}
