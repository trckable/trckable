// Sample worlds for Explore, development only (nothing imports this but the dynamic import in data/dev.ts, which is
// behind import.meta.env.DEV). They hold the numbers the design mock draws, so the app can be set beside it.
import type { Filter } from '../../../lib/api'
import { keyOf } from '../filters'
import type { Tabs, World } from '../types'
import worlds from './worlds.json'

export type WorldName = keyof typeof worlds

export const worldOf = (name: string): World => (worlds as unknown as Record<string, World>)[name] ?? (worlds as unknown as Record<string, World>).full

/** The answers for a set of filters; a set the sample has no answers for gets the unfiltered ones. */
export function tabsOf(world: World, filters: Filter[]): Tabs {
  return world.variants[keyOf(filters)] ?? world.variants['']
}
