// How wide each card of the Full grid is, and where it goes, so every row is
// full. Cards keep their order, except that when the next one does not fit
// what is left of a row, a narrower card from just behind it (at most two
// places back) moves up to fill the gap. Only when none fits does the last
// card of the row widen. No holes, whatever drops out.

const LOOKAHEAD = 2

export interface Packed {
  spans: number[] // columns per card, in the cards' own order
  order: number[] // the place each card takes in the grid
}

/** Spans and places for cards asking for `wants` columns in a grid of `cols`. */
export function packRows(wants: number[], cols: number): Packed {
  const want = wants.map((w) => Math.max(1, Math.min(w, cols)))
  const spans = [...want]
  const order: number[] = new Array<number>(want.length)
  const queue = want.map((_, i) => i)
  let left = cols
  let last = -1 // the card placed last, which widens when a row cannot fill
  let place = 0
  while (queue.length) {
    let pick = queue.findIndex((i, k) => k <= LOOKAHEAD && want[i] <= left)
    if (pick < 0) {
      spans[last] += left
      left = cols
      pick = 0
    }
    const i = queue.splice(pick, 1)[0]
    order[i] = place++
    left -= want[i]
    last = i
    if (left === 0) left = cols
  }
  if (last >= 0 && left !== cols) spans[last] += left
  return { spans, order }
}
