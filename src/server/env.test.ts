import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

const base = {
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_KEY: 'priv',
  INVITE_CODE: 'invita-123',
}
const turnstile = {
  TURNSTILE_SITE_KEY: '0x4AAA',
  TURNSTILE_SECRET: '0x4BBB',
  TURNSTILE_HOSTNAMES: 'ayunora.es, Www.Ayunora.es',
}

describe('loadEnv: Turnstile', () => {
  it('en desarrollo es opcional', () => {
    expect(loadEnv({ ...base, NODE_ENV: 'development' }).turnstile).toBeNull()
  })

  it('en producción es obligatorio (falla cerrado)', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/TURNSTILE_SECRET/)
  })

  it('una configuración a medias es un error también en desarrollo', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'development', TURNSTILE_SITE_KEY: '0x4AAA' }),
    ).toThrow(/TURNSTILE_SECRET/)
  })

  it('normaliza los dominios', () => {
    const env = loadEnv({ ...base, ...turnstile, NODE_ENV: 'production' })
    expect(env.turnstile).toEqual({
      siteKey: '0x4AAA',
      secret: '0x4BBB',
      hostnames: ['ayunora.es', 'www.ayunora.es'],
    })
  })

  it('en producción no admite localhost como dominio', () => {
    expect(() =>
      loadEnv({ ...base, ...turnstile, TURNSTILE_HOSTNAMES: 'localhost', NODE_ENV: 'production' }),
    ).toThrow(/localhost/)
  })
})

describe('loadEnv: claves de prueba de Turnstile', () => {
  it('en producción no arranca con la clave secreta de prueba', () => {
    expect(() =>
      loadEnv({
        ...base,
        ...turnstile,
        TURNSTILE_SECRET: '1x0000000000000000000000000000000AA',
        NODE_ENV: 'production',
      }),
    ).toThrow(/clave de prueba/)
  })

  it('en desarrollo sí la admite', () => {
    const env = loadEnv({
      ...base,
      TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      TURNSTILE_SECRET: '1x0000000000000000000000000000000AA',
      TURNSTILE_HOSTNAMES: 'example.com',
      NODE_ENV: 'development',
    })
    expect(env.turnstile?.hostnames).toEqual(['example.com'])
  })
})
