// After the build: every text file of the dashboard gets a brotli twin and a
// gzip twin beside it (app.js → app.js.br, app.js.gz), so the server hands a
// browser the bytes it asked for without compressing anything while a person
// waits (server/internal/web). A twin is kept only when it is smaller.
//
// Deterministic on purpose, because CI rebuilds the dashboard and compares it
// with what is committed: pako is zlib in plain JavaScript (see
// scripts/gzip-size.mjs), and brotli runs at its highest quality with fixed
// settings.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'
import pako from 'pako'

const dir = new URL('../../server/internal/web/dist/', import.meta.url).pathname
const TEXT = /\.(?:js|css|html|svg|json)$/
const MIN = 512 // under this a file costs about as much in headers as it saves

const brotli = (b) =>
  brotliCompressSync(b, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_LGWIN]: 22,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      [constants.BROTLI_PARAM_SIZE_HINT]: b.length,
    },
  })
const gzip = (b) => Buffer.from(pako.gzip(b, { level: 9 }))

let files = 0
let raw = 0
let br = 0
let gz = 0
for (const f of readdirSync(dir, { recursive: true })) {
  if (!TEXT.test(f)) continue
  const body = readFileSync(join(dir, f))
  if (body.length < MIN) continue
  const b = brotli(body)
  const g = gzip(body)
  if (b.length < body.length) writeFileSync(join(dir, f + '.br'), b)
  if (g.length < body.length) writeFileSync(join(dir, f + '.gz'), g)
  files++
  raw += body.length
  br += Math.min(b.length, body.length)
  gz += Math.min(g.length, body.length)
}
const kb = (n) => (n / 1024).toFixed(0)
console.log(`precompressed ${files} files: ${kb(raw)} KB, ${kb(br)} KB brotli, ${kb(gz)} KB gzip`)
