import './ModuleArt.css'
import { ART } from './moduleArtShapes'

// A small drawing per module, so the list can be read at a glance instead of
// word by word. Each one is a hand-written SVG (no images, no library, a few
// hundred bytes each) that animates gently when it is on screen; it holds
// still for anyone who asked for reduced motion.
export function ModuleArt({ id, large }: { id: string; large?: boolean }) {
  // Large fills the width it is given rather than sitting in the middle of
  // it: a dialog reads as one column, and a picture floating inside a wider
  // box reads as two.
  return (
    <svg
      className={large ? 'mart large' : 'mart'}
      width={large ? undefined : 104}
      height={large ? undefined : 58}
      viewBox="0 0 104 58"
      role="img"
      aria-label={`${id} preview`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* In the list the tile is the picture. In a dialog the surrounding
          band is the tile, so the drawing can be centred in a box as wide as
          the words under it. */}
      {!large && <rect x="0.5" y="0.5" width="103" height="57" rx="9" fill="var(--sunken)" stroke="var(--grid)" />}
      {ART[id] ?? ART.core}
    </svg>
  )
}

