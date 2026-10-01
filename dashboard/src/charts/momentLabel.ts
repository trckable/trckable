// The moment Replay is at, short enough for a chip: "Sep 14, 15:00" by the
// hour, the bucket's own name otherwise. Used by the chip's own chunk.
import type { Bucket } from '../lib/api'
import { bucketLabel } from './timeScale'

export function momentLabel(t: string, bucket: Bucket): string {
  if (bucket !== 'hour' || !t) return bucketLabel(t, bucket)
  return `${bucketLabel(t, 'day')}, ${t.slice(11, 16)}`
}
