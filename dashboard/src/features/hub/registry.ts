// Every feature the Features pop-up lists: where it belongs, which module
// switches it (if one does) and where "Open" takes you. Data only, so the
// avatar menu can read the ids without carrying the pop-up. A feature is here
// only if it is built; its words are in words.ts and its icon in icons.ts.
import type { AccountTab } from '../../lib/account'
import type { SettingsTab } from '../../lib/settings'

export type GroupId = 'traffic' | 'insights' | 'revenue' | 'share' | 'team' | 'setup'
export const GROUPS: GroupId[] = ['traffic', 'insights', 'revenue', 'share', 'team', 'setup']

/** Where "Open" goes: a settings section, an account section, the dashboard, or a control that is already on the page. */
export type Where =
  | { to: 'settings'; tab: SettingsTab }
  | { to: 'account'; tab: AccountTab }
  | { to: 'full' }
  | { to: 'ai' }
  | { to: 'calendar' }
  | { to: 'live' }
  | { to: 'all' }
  | { to: 'press'; key: 'share' | 'filter' | 'replay' | 'user' | 'ask' }
  | { to: 'shortcuts' }

export interface Feature {
  id: string
  group: GroupId
  /** The module that switches it on and off. */
  module?: string
  where?: Where
}

const settings = (tab: SettingsTab): Where => ({ to: 'settings', tab })
const account = (tab: AccountTab): Where => ({ to: 'account', tab })
const full: Where = { to: 'full' }

export const FEATURES: Feature[] = [
  { id: 'live', group: 'traffic', where: { to: 'live' } },
  { id: 'calendar', group: 'traffic', where: { to: 'calendar' } },
  { id: 'allsites', group: 'traffic', where: { to: 'all' } },
  { id: 'map', group: 'traffic', module: 'map', where: full },
  { id: 'ai', group: 'traffic', where: { to: 'ai' } },
  { id: 'crawlers', group: 'traffic', module: 'crawlers', where: { to: 'ai' } },
  { id: 'search', group: 'traffic', module: 'search', where: settings('search') },
  { id: 'outbound', group: 'traffic', module: 'outbound' },
  { id: 'forms', group: 'traffic', module: 'forms' },
  { id: 'rhythm', group: 'traffic', module: 'rhythm', where: full },

  { id: 'goals', group: 'insights', module: 'goals', where: full },
  { id: 'funnels', group: 'insights', module: 'funnels', where: full },
  { id: 'journeys', group: 'insights', module: 'journeys', where: full },
  { id: 'retention', group: 'insights', module: 'retention', where: full },
  { id: 'vitals', group: 'insights', module: 'vitals', where: full },
  { id: 'heatmaps', group: 'insights', module: 'heatmaps', where: full },
  { id: 'notes', group: 'insights', module: 'notes', where: settings('notes') },
  { id: 'milestones', group: 'insights', where: settings('notes') },
  { id: 'replay', group: 'insights', where: { to: 'press', key: 'replay' } },
  { id: 'segments', group: 'insights', where: { to: 'press', key: 'filter' } },
  { id: 'surge', group: 'insights', where: settings('alerts') },

  { id: 'revenue', group: 'revenue', module: 'revenue', where: settings('payments') },
  { id: 'sales', group: 'revenue', where: account('profile') },

  { id: 'sharelinks', group: 'share', where: settings('sharing') },
  { id: 'sharecard', group: 'share', where: { to: 'press', key: 'share' } },
  { id: 'whitelabel', group: 'share', where: { to: 'press', key: 'share' } },
  { id: 'reports', group: 'share', where: settings('alerts') },
  { id: 'weekly', group: 'share', where: settings('alerts') },
  { id: 'widgets', group: 'share', where: settings('widgets') },

  { id: 'people', group: 'team', where: account('people') },
  { id: 'keys', group: 'team', where: account('keys') },
  { id: 'sso', group: 'team' },
  { id: 'twostep', group: 'team', where: account('profile') },
  { id: 'privacy', group: 'team', where: settings('privacy') },
  { id: 'consent', group: 'team', module: 'consent', where: settings('privacy') },
  { id: 'exclude', group: 'team', where: settings('privacy') },
  { id: 'bots', group: 'team', where: settings('privacy') },

  { id: 'install', group: 'setup', where: settings('install') },
  { id: 'ga', group: 'setup', where: settings('install') },
  { id: 'pwa', group: 'setup', where: { to: 'press', key: 'user' } },
  { id: 'language', group: 'setup', where: { to: 'press', key: 'user' } },
  { id: 'shortcuts', group: 'setup', where: { to: 'shortcuts' } },
  { id: 'peek', group: 'setup', where: { to: 'press', key: 'ask' } },
  { id: 'modules', group: 'setup', where: settings('modules') },
  { id: 'health', group: 'setup', where: settings('health') },
]

/** A site's own settings and account sections are an owner's; a viewer is shown the status only. */
export function ownerOnly(f: Feature): boolean {
  const w = f.where
  if (!w) return false
  if (w.to === 'settings') return true
  if (w.to === 'account') return w.tab !== 'profile'
  return w.to === 'press' && (w.key === 'share' || w.key === 'ask')
}
