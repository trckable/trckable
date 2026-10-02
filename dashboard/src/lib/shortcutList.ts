// The shortcuts as the list shows them: each action's name and group beside the
// key it answers to by default (lib/keys.ts keeps only the keys, so the names
// are not part of the first load).
import { PRESETS } from './dates'
import { defaultOf, keyFor } from './keys'

export type Group = 'around' | 'period'
export type Action = { id: string; label: string; group: Group; def: string }

const named = (id: string, label: string, group: Group): Action => ({ id, label, group, def: defaultOf(id) })

export const ACTIONS: Action[] = [
  named('shortcuts', 'This list', 'around'),
  named('ask', 'Peek', 'around'),
  named('mode', 'Core ↔ Full', 'around'),
  named('live', 'Live ↔ Data', 'around'),
  named('create', 'Create a goal, funnel or note', 'around'),
  ...PRESETS.flatMap((p) => (p.key ? [named('period.' + p.id, p.label, 'period')] : [])),
  named('back', 'Step back', 'period'),
  named('forward', 'Step forward', 'period'),
  named('compare', 'Compare', 'period'),
]

/** The action a key already belongs to, if any, so two never share one. */
export const takenBy = (combo: string, except: string) => ACTIONS.find((a) => a.id !== except && keyFor(a.id) === combo)
