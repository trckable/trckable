// Who may do what, in one place. A screen asks `can('goal.create')` and never
// looks at a role itself (eslint fails a role compared anywhere else). The
// server is still the one enforcing this: the table only avoids offering a
// control that would come back 403, and it is held to the server's own table
// (server/internal/permissions/permissions.go) by the fixture permissions.json.
import { currentRole, isShared } from './me'

export type Action =
  | 'site.add'
  | 'site.settings'
  | 'site.delete'
  | 'goal.create'
  | 'funnel.create'
  | 'note.write'
  | 'share.manage'
  | 'widget.manage'
  | 'alert.manage'
  | 'payment.manage'
  | 'mention.manage'
  | 'answers.manage'
  | 'data.erase'
  | 'peek.ask'
  | 'setup.run'
  | 'member.manage'
  | 'team.manage'
  | 'search.connect'
  | 'import.google'
  | 'channels.connect'
  | 'channels.disconnect'
  | 'update.check'

/** Every action, the one list a new role's row is built from. */
export const ACTIONS: readonly Action[] = [
  'site.add', 'site.settings', 'site.delete', 'goal.create', 'funnel.create', 'note.write',
  'share.manage', 'widget.manage', 'alert.manage', 'payment.manage', 'mention.manage', 'answers.manage', 'data.erase',
  'peek.ask', 'setup.run', 'member.manage', 'team.manage', 'search.connect', 'import.google', 'channels.connect', 'channels.disconnect', 'update.check',
]

// A role with no row may do nothing: a missing or new role never shows a
// control the server would refuse. A viewer reads this instance and may ask Peek about it; the person's
// own account (password, name, picture, shortcuts) is theirs whatever the
// role, so it has no action here.
const table = new Map<string, ReadonlySet<Action>>([
  ['owner', new Set(ACTIONS)],
  ['viewer', new Set<Action>(['peek.ask'])],
])

/** Give a role its row, for a build that has a role of its own. Called once
 *  at start-up; a second call for the same role replaces its row. */
export function defineRole(role: string, actions: readonly Action[]) {
  table.set(role, new Set(actions))
}

/** The table as plain lists (the fixture test compares it with the server's). */
export const rolesOf = (action: Action): string[] => [...table].filter(([, set]) => set.has(action)).map(([role]) => role)

/** Whether this page may offer the action to the person using it: never on a
 *  shared link, and never before anyone is known. */
export const can = (action: Action): boolean => !isShared() && (table.get(currentRole())?.has(action) ?? false)

/** `can` for a component's top level. */
export const useCan = (action: Action): boolean => can(action)

/** Whether a listed person (not the one signed in) holds the owner role. */
export const isOwnerRole = (role: string | undefined): boolean => role === 'owner'
