// Core ↔ Full, drawn as the two layouts themselves. The glyph is the same
// five rectangles in both states; switching moves them, so the button shows
// what it is about to do rather than naming it.
//
//   Core     one wide block, three cards under it
//   Full     the block splits and the row fills out — the denser screen
import type { CSSProperties } from 'react'
import { caps, keyFor, useKeymap } from '../lib/keys'

// x, y, width, height per state. The same shapes, moved — nothing appears from
// nowhere except the pieces Full adds, which grow out of an edge.
type Box = [number, number, number, number]
const SHAPES: { core: Box; full: Box }[] = [
  { core: [2, 2, 16, 5.5], full: [2, 2, 7.5, 5.5] }, // the chart, halved
  { core: [10.5, 2, 0, 5.5], full: [10.5, 2, 7.5, 5.5] }, // its other half, out of the fold
  { core: [2, 9.5, 4.6, 8.5], full: [2, 9.5, 4.6, 4] }, // three cards, shortened
  { core: [7.7, 9.5, 4.6, 8.5], full: [7.7, 9.5, 4.6, 4] },
  { core: [13.4, 9.5, 4.6, 8.5], full: [13.4, 9.5, 4.6, 4] },
  { core: [2, 18, 16, 0], full: [2, 14.5, 16, 3.5] }, // the row only Full has
]

export function ModeToggle({ full, onToggle }: { full: boolean; onToggle: () => void }) {
  useKeymap()
  // Geometry as CSS so it transitions; as SVG attributes it would jump.
  const at = (s: Box): CSSProperties => ({ x: s[0], y: s[1], width: s[2], height: s[3] })
  return (
    <button
      type="button"
      className={full ? 'btn mode-toggle on' : 'btn mode-toggle'}
      aria-pressed={full}
      aria-label={full ? 'Switch to Core' : 'Switch to Full'}
      title={full ? 'Core — one calm screen (F)' : 'Full — every number (F)'}
      onClick={onToggle}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        {SHAPES.map((s, i) => (
          <rect key={i} rx="1.4" style={at(full ? s.full : s.core)} />
        ))}
      </svg>
      <span className="mode-name">{full ? 'Full' : 'Core'}</span>
      <span className="kbd">{caps(keyFor('mode')).join('')}</span>
    </button>
  )
}
