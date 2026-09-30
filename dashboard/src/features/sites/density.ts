// How roomy the switcher's list is: the fewer the sites, the more space each
// row gets (a list of one to three should not look squeezed), and the
// compact rows with a search are for a long list.
export type Density = 'roomy' | 'mid' | 'compact'

/** Up to this many sites the rows are roomy. */
const ROOMY_TO = 3
/** Up to this many, the middle size; beyond it, compact. */
const MID_TO = 6

export function densityOf(sites: number): Density {
  if (sites <= ROOMY_TO) return 'roomy'
  return sites <= MID_TO ? 'mid' : 'compact'
}

/** The site mark's size for each. */
export const MARK: Record<Density, number> = { roomy: 22, mid: 20, compact: 18 }
