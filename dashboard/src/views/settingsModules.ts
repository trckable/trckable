// Settings sections that exist for one module: which module owns each comes
// from the registry (lib/modules.ts); this is what the section says while
// that module is off.
import type { SettingsTab as TabID } from '../lib/settings'
import { settingsModule } from '../lib/modules'

export const moduleOf = (tab: TabID): string | undefined => settingsModule(tab)
export const MODULE_WHY: Partial<Record<TabID, { name: string; what: string }>> = {
  search: { name: 'Search Console', what: 'Turn it on to connect Google Search Console and see which searches showed your site, next to your own numbers.' },
  payments: { name: 'Revenue', what: 'Turn it on to connect Stripe, Lemon Squeezy, Polar, Paddle or Dodo and see which traffic pays.' },
  notes: { name: 'Notes', what: 'Turn it on to mark days on the chart with a line on why they look the way they do.' },
}
