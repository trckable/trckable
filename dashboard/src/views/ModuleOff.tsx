import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { isViewer } from '../lib/me'
import { fail, more, type Site } from '../lib/apiMore'
import { MODULE_WHY, moduleOf } from './settingsModules'
import type { SettingsTab } from '../lib/settings'

/** A module's section while the module is off: what it would do, and the
 *  switch to turn it on — rather than a setup for something that is off. */
export function ModuleOff({ site, tab, icon, onOn }: { site: Site; tab: SettingsTab; icon: LucideIcon | undefined; onOn: () => void }) {
  const [busy, setBusy] = useState(false)
  const why = MODULE_WHY[tab]
  const id = moduleOf(tab)
  const Icon = icon
  if (!why || !id || !Icon) return null
  return (
    <section className="card module-off">
      <span className="icon-tile">
        <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div>
        <h3>The {why.name} module is off</h3>
        <p className="muted">{why.what}</p>
      </div>
      {!isViewer() && (
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            more
              .setModule(site.id, id, true)
              .then(onOn)
              .catch((e: unknown) => fail(e))
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Turning on…' : 'Turn on'}
        </button>
      )}
    </section>
  )
}
