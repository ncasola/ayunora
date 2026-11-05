// Comprueba el service worker generado. Si el precache tiene una URL repetida con distinta
// revisión, Workbox lanza `add-to-cache-list-conflicting-entries`, el SW no se instala y
// `navigator.serviceWorker.ready` no se resuelve nunca: el push deja de funcionar sin dar error.
import { readFileSync } from 'node:fs'

const path = process.argv[2] ?? 'dist/web/sw.js'
const source = readFileSync(path, 'utf8')
const entries = [...source.matchAll(/\{"revision":(?:"[^"]*"|null),"url":"([^"]+)"\}/g)].map(
  (m) => m[1],
)

if (entries.length === 0) {
  console.error(`check-sw: no se encontró el precache en ${path}`)
  process.exit(1)
}

const seen = new Set()
const duplicated = entries.filter((url) => (seen.has(url) ? true : (seen.add(url), false)))
if (duplicated.length > 0) {
  console.error(`check-sw: URLs repetidas en el precache: ${[...new Set(duplicated)].join(', ')}`)
  process.exit(1)
}

for (const required of ['index.html', 'manifest.webmanifest']) {
  if (!seen.has(required)) {
    console.error(`check-sw: falta ${required} en el precache`)
    process.exit(1)
  }
}

console.log(`check-sw: ${entries.length} entradas en el precache, sin duplicados`)
