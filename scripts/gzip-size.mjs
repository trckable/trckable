// One gzip for every size trckable measures and publishes. pako is zlib in
// plain JavaScript, so a file gives the same number on every machine; Node's
// own zlib takes CPU-specific paths and differs by a few bytes between a Mac
// and CI, which is how one script used to have three sizes.
import { existsSync, readFileSync } from 'node:fs'
import * as pako from 'pako'

/** Bytes of `data` gzipped at level 9. */
export const gzipSize = (data) => pako.gzip(data, { level: 9 }).length

/** A dist file's plain bytes: the file, or the gzip that replaced it (dashboard/scripts/precompress.mjs). */
export const readDist = (path) => (existsSync(path) ? readFileSync(path) : Buffer.from(pako.ungzip(readFileSync(path + '.gz'))))

/** Its gzip size: the stored gzip's own length when there is one (the same level 9), else computed. */
export const distGzipSize = (path) => (existsSync(path + '.gz') ? readFileSync(path + '.gz').length : gzipSize(readFileSync(path)))
