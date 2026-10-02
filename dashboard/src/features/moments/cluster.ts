// The others that landed beside the open pin, as the rows of a short list: the
// milestones together in one row ("4 milestones", the list on tap), at most
// SHOWN rows, the rest behind "+N more". Pure: cluster.test.ts.
import type { Pin } from './pins'

/** Rows listed before "+N more". */
export const SHOWN = 3
/** From this many milestones, they are one row. */
const GROUP_FROM = 2

/** A pin and where it is among the marker's pins (what picking it hands back). */
export interface Item {
  k: number
  pin: Pin
}

export type Row = { group: false; item: Item } | { group: true; items: Item[] }

/** The rows for the pins but the open one (`at`), in their order; the milestones, when there are several, stand in one row where the first was. */
export function rowsOf(pins: Pin[], at: number): Row[] {
  const items = pins.map((pin, k): Item => ({ k, pin })).filter((i) => i.k !== at)
  const miles = items.filter((i) => i.pin.kind === 'milestone')
  const rows: Row[] = []
  for (const item of items) {
    if (item.pin.kind !== 'milestone' || miles.length < GROUP_FROM) rows.push({ group: false, item })
    else if (item === miles[0]) rows.push({ group: true, items: miles })
  }
  return rows
}

const size = (r: Row) => (r.group ? r.items.length : 1)

/** The rows to show now, and how many pins are behind "+N more" (0 when all are shown or the list is open). */
export function visibleRows(rows: Row[], all: boolean): { shown: Row[]; hidden: number } {
  if (all || rows.length <= SHOWN) return { shown: rows, hidden: 0 }
  return { shown: rows.slice(0, SHOWN), hidden: rows.slice(SHOWN).reduce((n, r) => n + size(r), 0) }
}
