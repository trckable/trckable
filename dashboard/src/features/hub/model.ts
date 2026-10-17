// What a card shows and what it may do, from the registry and who is looking.
// Pure: model.test.ts.
import { CHOICES, isOn, type Mods } from '../../lib/modules'
import { FEATURES, ownerOnly, type Feature } from './registry'

export type Status = 'on' | 'off' | 'builtIn' | 'server'

/** A module's feature is on or off; one without a module is built in, and one with nowhere to open is set on the server. */
export function statusOf(f: Feature, mods: Mods): Status {
  if (f.module) return isOn(mods, f.module) ? 'on' : 'off'
  return f.where ? 'builtIn' : 'server'
}

/** Only an owner switches a choice (what the script records): a viewer, or a shared page, sees the status. Revenue and search are on once connected, the rest has no switch. */
export const canToggle = (f: Feature, owner: boolean): boolean => owner && f.module !== undefined && CHOICES.includes(f.module)

/** "Open" is offered where there is somewhere to go that this person may go: not to an owner's settings for a viewer, nor to a choice that is off. Revenue and search open their settings to connect. */
export function canOpen(f: Feature, who: { owner: boolean; mods: Mods }): boolean {
  if (!f.where) return false
  if (ownerOnly(f) && !who.owner) return false
  return !f.module || !CHOICES.includes(f.module) || isOn(who.mods, f.module)
}

/** What a search matches: the feature's name, its line and its group. */
export function matches(text: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  return q === '' || text.toLowerCase().includes(q)
}

export const ids = (): string[] => FEATURES.map((f) => f.id)
