// The shortcuts as the list shows them: each action's name and group beside the
// key it answers to by default (lib/keys.ts keeps only the keys, so the names
// are not part of the first load).
import { defaultOf, keyFor } from './keys'

export type Group = 'around' | 'page'
export type Action = { id: string; label: string; group: Group; def: string }

const named = (id: string, label: string, group: Group): Action => ({ id, label, group, def: defaultOf(id) })

export const ACTIONS: Action[] = [
  named('shortcuts', 'This list', 'around'),
  named('ask', 'Peek and the palette', 'around'),
  named('live', 'Live', 'around'),
  named('briefing', 'Briefing', 'around'),
  named('explore', 'Explore', 'around'),
  named('site', 'Switch site', 'around'),
  named('user', 'Your menu', 'around'),
  named('settings', 'Settings', 'around'),
  // Each answers to the control on the page that does it (ShortcutsHost): one that is not there answers nothing.
  named('filter', 'Find (the palette)', 'page'),
  named('share', 'Share', 'page'),
]

/** The action a key already belongs to, if any, so two never share one. */
export const takenBy = (combo: string, except: string) => ACTIONS.find((a) => a.id !== except && keyFor(a.id) === combo)
