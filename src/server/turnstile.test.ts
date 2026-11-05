import { describe, expect, it } from 'vitest'
import { createTurnstileVerifier, isTestingSecret, SITEVERIFY_URL } from './turnstile'

function fakeFetch(response: unknown, status = 200) {
  const calls: Array<{ url: string; body: URLSearchParams }> = []
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as URLSearchParams })
    return new Response(JSON.stringify(response), { status })
  }) as unknown as typeof fetch
  return { fn, calls }
}

const ok = { success: true, action: 'login', hostname: 'ayunora.es', 'error-codes': [] }

describe('Turnstile', () => {
  it('acepta un token válido para la acción y el dominio esperados', async () => {
    const { fn, calls } = fakeFetch(ok)
    const v = createTurnstileVerifier({ secret: 's3cr3t', hostnames: ['ayunora.es'], fetch: fn })
    expect(await v.verify('tok', 'login', '1.2.3.4')).toEqual({ ok: true })
    expect(calls[0]!.url).toBe(SITEVERIFY_URL)
    expect(Object.fromEntries(calls[0]!.body)).toEqual({
      secret: 's3cr3t',
      response: 'tok',
      remoteip: '1.2.3.4',
    })
  })

  it('no manda remoteip si no se conoce la IP', async () => {
    const { fn, calls } = fakeFetch(ok)
    const v = createTurnstileVerifier({ secret: 's', hostnames: ['ayunora.es'], fetch: fn })
    await v.verify('tok', 'login', 'local')
    expect(calls[0]!.body.has('remoteip')).toBe(false)
  })

  it('rechaza sin token, con token vacío o demasiado largo, sin llamar a Cloudflare', async () => {
    const { fn, calls } = fakeFetch(ok)
    const v = createTurnstileVerifier({ secret: 's', hostnames: ['ayunora.es'], fetch: fn })
    for (const t of [undefined, '', 42, 'x'.repeat(2049)]) {
      expect(await v.verify(t, 'login', null)).toMatchObject({ ok: false, reason: 'missing' })
    }
    expect(calls).toHaveLength(0)
  })

  it('rechaza tokens inválidos o ya usados', async () => {
    const { fn } = fakeFetch({ success: false, 'error-codes': ['timeout-or-duplicate'] })
    const v = createTurnstileVerifier({ secret: 's', hostnames: ['ayunora.es'], fetch: fn })
    expect(await v.verify('tok', 'login', null)).toEqual({
      ok: false,
      reason: 'invalid',
      errorCodes: ['timeout-or-duplicate'],
    })
  })

  it('rechaza un token emitido para otra acción', async () => {
    const { fn } = fakeFetch({ ...ok, action: 'register' })
    const v = createTurnstileVerifier({ secret: 's', hostnames: ['ayunora.es'], fetch: fn })
    expect(await v.verify('tok', 'login', null)).toMatchObject({ ok: false, reason: 'action' })
  })

  it('rechaza un token emitido para otro dominio', async () => {
    const { fn } = fakeFetch({ ...ok, hostname: 'malo.example' })
    const v = createTurnstileVerifier({ secret: 's', hostnames: ['ayunora.es'], fetch: fn })
    expect(await v.verify('tok', 'login', null)).toMatchObject({ ok: false, reason: 'hostname' })
  })

  it('falla cerrado si Cloudflare no responde o da error', async () => {
    const down = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    const v1 = createTurnstileVerifier({ secret: 's', hostnames: ['ayunora.es'], fetch: down })
    expect(await v1.verify('tok', 'login', null)).toMatchObject({
      ok: false,
      reason: 'unavailable',
    })

    const { fn } = fakeFetch({}, 500)
    const v2 = createTurnstileVerifier({ secret: 's', hostnames: ['ayunora.es'], fetch: fn })
    expect(await v2.verify('tok', 'login', null)).toMatchObject({
      ok: false,
      reason: 'unavailable',
    })
  })
})

describe('Turnstile: claves de prueba', () => {
  const testing = {
    success: true,
    hostname: 'example.com',
    metadata: { result_with_testing_key: true },
  }

  it('fuera de producción acepta la respuesta de prueba aunque no traiga action', async () => {
    const { fn } = fakeFetch(testing)
    const v = createTurnstileVerifier({
      secret: 's',
      hostnames: ['example.com'],
      allowTestingKeys: true,
      fetch: fn,
    })
    expect(await v.verify('tok', 'login', null)).toEqual({ ok: true })
  })

  it('en producción rechaza cualquier respuesta de prueba', async () => {
    const { fn } = fakeFetch({ ...testing, action: 'login' })
    const v = createTurnstileVerifier({ secret: 's', hostnames: ['example.com'], fetch: fn })
    expect(await v.verify('tok', 'login', null)).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('reconoce las claves secretas de prueba públicas', () => {
    expect(isTestingSecret('1x0000000000000000000000000000000AA')).toBe(true)
    expect(isTestingSecret('2x0000000000000000000000000000000AA')).toBe(true)
    expect(isTestingSecret('0x4AAAAAAAreal')).toBe(false)
  })
})
