// The colour an owner chose for their share links, as the page's accent: the
// buttons, links and focus ring follow it, and the text on it is black or
// white, whichever reads better. Anything that is not #rrggbb is ignored.
import type { CSSProperties } from 'react'

export function accentVars(hex?: string): CSSProperties | undefined {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5
  return {
    '--accent': hex,
    '--accent-strong': hex,
    '--accent-ink': light ? '#0b0d10' : '#ffffff',
    '--accent-soft': `color-mix(in srgb, ${hex} 14%, transparent)`,
  } as CSSProperties
}
