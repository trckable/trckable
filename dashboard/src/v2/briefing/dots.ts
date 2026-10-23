// The dot strip of a source that jumped: one dot is a few people, and the strip never wraps, so how many people a dot
// stands for follows the width the strip has.
export const DOT = 9
export const DOT_GAP = 4

/** How many dots fit one line of this width. */
export const roomFor = (width: number): number => Math.max(1, Math.floor((width + DOT_GAP) / (DOT + DOT_GAP)))

/** The people one dot stands for so that `now` people fit one line, how many dots that is, and how many of them are the usual's. */
export function dotsFit(now: number, usual: number, width: number): { n: number; per: number; grey: number } {
  const per = Math.max(1, Math.ceil(now / roomFor(width)))
  const n = Math.max(1, Math.round(now / per))
  return { n, per, grey: Math.min(n, Math.round(usual / per)) }
}
