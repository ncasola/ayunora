import { and, desc, eq, isNotNull, isNull, lt, ne } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import {
  startFastSchema,
  stopFastSchema,
  updateFastSchema,
  type ActiveFastDto,
  type FastDto,
} from '../../shared/api'
import { apiError, readJson, requireAuth, type AppEnv } from '../context'
import type { Db } from '../db'
import { fasts, type FastRow } from '../db/schema'
import { isUniqueViolation, type AppDeps } from '../deps'

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

function activeFast(db: Db, userId: number) {
  return db
    .select()
    .from(fasts)
    .where(and(eq(fasts.userId, userId), isNull(fasts.endedAt)))
    .get()
}

/** Fin del último ayuno terminado, opcionalmente excluyendo uno y solo antes de cierta fecha. */
function lastEndedAt(
  db: Db,
  userId: number,
  opts: { excludeId?: number; startedBefore?: Date } = {},
) {
  const row = db
    .select({ endedAt: fasts.endedAt })
    .from(fasts)
    .where(
      and(
        eq(fasts.userId, userId),
        isNotNull(fasts.endedAt),
        opts.excludeId !== undefined ? ne(fasts.id, opts.excludeId) : undefined,
        opts.startedBefore ? lt(fasts.startedAt, opts.startedBefore) : undefined,
      ),
    )
    .orderBy(desc(fasts.endedAt))
    .limit(1)
    .get()
  return row?.endedAt?.getTime() ?? null
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
  return new Hono<AppEnv>()
    .use('*', requireAuth)

    .get('/active', (c) => {
      const userId = c.get('user')!.id
      const active = activeFast(db, userId)
      const dto: ActiveFastDto = {
        active: active ? toFastDto(active) : null,
        lastEndedAt: lastEndedAt(db, userId),
      }
      return c.json(dto)
    })

    .post('/', async (c) => {
      const body = await readJson(c, startFastSchema)
      if ('response' in body) return body.response
      const userId = c.get('user')!.id
      const t = now()

      if (activeFast(db, userId)) return apiError(c, 409, 'fast_already_active')

      const startedAt = body.data.startedAt ?? t
      if (startedAt > t + CLOCK_SKEW_MS || startedAt < t - MAX_BACKDATE_MS) {
        return apiError(c, 400, 'invalid_time_range')
      }
      const prevEnd = lastEndedAt(db, userId)
      if (prevEnd !== null && startedAt < prevEnd) return apiError(c, 409, 'overlaps_previous')

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
        return c.json(toFastDto(row), 201)
      } catch (err) {
        // Dos peticiones simultáneas: el índice único parcial frena la segunda.
        if (isUniqueViolation(err)) return apiError(c, 409, 'fast_already_active')
        throw err
      }
    })

    .post('/:id/stop', async (c) => {
      const body = await readJson(c, stopFastSchema)
      if ('response' in body) return body.response
      const fast = ownFast(c, db)
      if (!fast) return apiError(c, 404, 'not_found')
      if (fast.endedAt) return apiError(c, 409, 'fast_not_active')

      const t = now()
      const endedAt = body.data.endedAt ?? t
      if (endedAt <= fast.startedAt.getTime() || endedAt > t + CLOCK_SKEW_MS) {
        return apiError(c, 400, 'invalid_time_range')
      }
      const row = db
        .update(fasts)
        .set({ endedAt: new Date(endedAt), updatedAt: new Date(t) })
        .where(eq(fasts.id, fast.id))
        .returning()
        .get()!
      return c.json(toFastDto(row))
    })

    .patch('/:id', async (c) => {
      const body = await readJson(c, updateFastSchema)
      if ('response' in body) return body.response
      const fast = ownFast(c, db)
      if (!fast) return apiError(c, 404, 'not_found')

      const t = now()
      const { startedAt, plan, goalMinutes, note } = body.data
      if (startedAt !== undefined) {
        if (startedAt > t + CLOCK_SKEW_MS) return apiError(c, 400, 'invalid_time_range')
        if (fast.endedAt && startedAt >= fast.endedAt.getTime()) {
          return apiError(c, 400, 'invalid_time_range')
        }
        const prevEnd = lastEndedAt(db, fast.userId, {
          excludeId: fast.id,
          startedBefore: fast.startedAt,
        })
        if (prevEnd !== null && startedAt < prevEnd) return apiError(c, 409, 'overlaps_previous')
      }

      const row = db
        .update(fasts)
        .set({
          ...(startedAt !== undefined && { startedAt: new Date(startedAt) }),
          ...(plan !== undefined && { plan }),
          ...(goalMinutes !== undefined && { goalMinutes }),
          ...(note !== undefined && { note }),
          updatedAt: new Date(t),
        })
        .where(eq(fasts.id, fast.id))
        .returning()
        .get()!
      return c.json(toFastDto(row))
    })
}
