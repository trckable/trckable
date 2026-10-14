import type { CSSProperties } from 'react'
import './Skeleton.css'

/** A card or chart waiting for its first data: a soft shimmering block at the
 *  height of the finished one, so nothing jumps when the data lands. */
export function Skeleton({ height, label = 'Loading…' }: { height: number; label?: string }) {
  const style: CSSProperties = { height }
  return <div className="skel" role="status" aria-busy="true" aria-label={label} style={style} />
}
