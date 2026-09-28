// The tab row's rules, apart from the drawing, so they can be tested: which
// tabs show, and where an arrow key goes.
import { METHODS } from '../../lib/install'
import { TABS } from './snippet'

const common: readonly string[] = TABS

/** The four common tabs, plus the method picked from More… as a fifth. */
export const tabsFor = (value: string): string[] => (common.includes(value) ? [...common] : [...common, value])

/** Every method not already a tab: what More… offers. */
export const moreItems = () => METHODS.filter((m) => !common.includes(m.id)).map((m) => ({ id: m.id, label: m.name, group: m.group, hint: m.keywords }))

/** Where a key moves focus from tab `at` of `count`; null for any other key.
 *  Arrows wrap around, Home and End jump to the ends. */
export function keyTarget(key: string, at: number, count: number): number | null {
  const last = count - 1
  switch (key) {
    case 'ArrowRight':
      return at === last ? 0 : at + 1
    case 'ArrowLeft':
      return at === 0 ? last : at - 1
    case 'Home':
      return 0
    case 'End':
      return last
    default:
      return null
  }
}

export const isCommon = (id: string) => common.includes(id)
