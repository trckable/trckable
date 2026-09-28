// One gzip for every size trckable measures and publishes. pako is zlib in
// plain JavaScript, so a file gives the same number on every machine; Node's
// own zlib takes CPU-specific paths and differs by a few bytes between a Mac
// and CI, which is how one script used to have three sizes.
import pako from 'pako'

/** Bytes of `data` gzipped at level 9. */
export const gzipSize = (data) => pako.gzip(data, { level: 9 }).length
