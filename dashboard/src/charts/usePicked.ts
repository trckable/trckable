// The bucket the pointer (or a key) picked on the main chart. It is an index,
// so when the period changes under a resting pointer (a key, the picker) the
// bucket it named may be gone: the old index is let go of at once, instead of
// reading a label that no longer exists. While Replay plays nothing is picked.
import { useState, type Dispatch, type SetStateAction } from 'react'

/** Whether a picked bucket is no longer there to show: Replay plays, or the chart has fewer buckets now. */
export const pickedGone = (picked: number | null, n: number, locked?: boolean) => picked !== null && (!!locked || picked >= n)

export function usePicked(n: number, locked?: boolean): [number | null, Dispatch<SetStateAction<number | null>>] {
  const [picked, set] = useState<number | null>(null)
  const gone = pickedGone(picked, n, locked)
  if (gone) set(null)
  return [gone ? null : picked, set]
}
