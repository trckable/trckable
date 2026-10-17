// The shortcuts as the list shows them: each action's name and group beside the
// key it answers to by default (lib/keys.ts keeps only the keys, so the names
// are not part of the first load).
import { PRESETS } from './dates'
import { defaultOf, keyFor } from './keys'

export type Group = 'around' | 'page' | 'period'
export type Action = { id: string; label: string; group: Group; def: string }

/** The periods that have a key on the Briefing. */
const KEYED = ['today', 'yesterday', '7d', '30d', '90d', '12mo', 'wtd', 'mtd']

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
  named('create', 'Create a goal, funnel or note', 'page'),
  named('replay', 'Replay: play or pause', 'page'),
  // The Briefing's menu offers these (v2/usePeriodKeys.ts).
  ...PRESETS.flatMap((p) => (p.key && KEYED.includes(p.id) ? [named('period.' + p.id, p.label, 'period')] : [])),
  named('back', 'Step back', 'period'),
  named('forward', 'Step forward', 'period'),
  named('compare', 'Compare', 'period'),
]

/** The action a key already belongs to, if any, so two never share one. */
export const takenBy = (combo: string, except: string) => ACTIONS.find((a) => a.id !== except && keyFor(a.id) === combo)
