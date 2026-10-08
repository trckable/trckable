// After the build: every text file of 1 KB or more is replaced by its gzip
// (app.js → app.js.gz), so the embedded dashboard, and the image that carries
// it, hold one copy of each file. The server hands the stored bytes to a
// browser that takes gzip and decompresses them for any other client
// (server/internal/web). Smaller files stay as they are, and so does any
// file gzip does not make smaller.
//
// Deterministic on purpose, because CI rebuilds the dashboard and compares it
// with what is committed: pako is zlib in plain JavaScript (see
// scripts/gzip-size.mjs).
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as pako from 'pako'

const dir = new URL('../../server/internal/web/dist/', import.meta.url).pathname
const TEXT = /\.(?:js|css|html|svg|json)$/
const MIN = 1024

let files = 0
let raw = 0
let gz = 0
for (const f of readdirSync(dir, { recursive: true })) {
  if (!TEXT.test(f)) continue
  const body = readFileSync(join(dir, f))
  if (body.length < MIN) continue
  const g = Buffer.from(pako.gzip(body, { level: 9 }))
  if (g.length >= body.length) continue
  writeFileSync(join(dir, f + '.gz'), g)
  rmSync(join(dir, f))
  files++
  raw += body.length
  gz += g.length
}
// vite empties the folder, and git needs .keep there so the Go embed has a file
// in a checkout that has not built the dashboard.
writeFileSync(join(dir, '.keep'), '')
const kb = (n) => (n / 1024).toFixed(0)
console.log(`stored ${files} files as gzip: ${kb(raw)} KB plain, ${kb(gz)} KB`)
