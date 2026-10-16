// The way into the sample worlds. Only in development: in a build the check below is false and the fixture is never
// part of the page. `?xfx=full` (or bare, long) turns it on and stays on for the tab; `?xfx=off` turns it off.
import type { Filter } from '../../../lib/api'
import type { Tab, Tabs, World } from '../types'

const KEY = 'trckable:xfx'

export function fixtureName(): string | null {
  if (!import.meta.env.DEV) return null
  try {
    const q = new URLSearchParams(location.search).get('xfx')
    if (q !== null) sessionStorage.setItem(KEY, q)
    const name = sessionStorage.getItem(KEY)
    return name && name !== 'off' ? name : null
  } catch {
    return null
  }
}

/** How long the sample takes to answer, so the loading shape can be seen: forever when `?xfh=1` holds it. */
const wait = (): Promise<void> => {
  if (new URLSearchParams(location.search).has('xfh')) return new Promise(() => undefined)
  return new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 240))
}

export async function fixtureTab<K extends Tab>(name: string, tab: K, filters: Filter[]): Promise<Tabs[K]> {
  if (import.meta.env.DEV) {
    const m = await import('../fixture')
    await wait()
    return m.tabsOf(m.worldOf(name), filters)[tab]
  }
  throw new Error('no sample')
}

export async function fixtureWorld(name: string): Promise<World> {
  if (import.meta.env.DEV) return (await import('../fixture')).worldOf(name)
  throw new Error('no sample')
}
