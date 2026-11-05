import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// scrypt viene con Node, así que no hace falta ninguna dependencia nativa.
// N=2^15 usa unos 32 MB por hash: es seguro y cabe en un VPS de 2 GB.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } satisfies ScryptOptions
const KEY_LENGTH = 32

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, opts, (err, key) =>
      err ? reject(err) : resolve(key),
    )
  })
}

/** Formato: `scrypt$N$r$p$saltB64$hashB64`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, PARAMS)
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, keyB64] = stored.split('$')
  if (algo !== 'scrypt' || !n || !r || !p || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64')
  const key = await derive(password, Buffer.from(saltB64, 'base64'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/** Hash que se usa cuando el email no existe, para que el login tarde lo mismo. */
let dummyHash: Promise<string> | undefined
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('no-existe-este-usuario')
  return dummyHash
}
