// Cookieless mode, one row beside the code: a switch and its name, and one line of what it
// does under it once it is on. Either way it asks first, with the same comparison in the
// direction of the change. The setting is the site's own, so the script tag never changes:
// only bundled installs, which never load the server's script, carry it in their code.
import { lazy, Suspense, useState } from 'react'
import { Switch } from '../../components/Switch'
import { copy } from './copy'
import type { Cookieless } from './useCookieless'

const CookielessDialog = lazy(() => import('./CookielessDialog').then((m) => ({ default: m.CookielessDialog })))
const t = copy.cookieless

function hintOf(state: Cookieless, bundled: boolean): string {
  if (state.locked) return t.viewer
  if (state.on !== true) return ''
  return bundled ? t.onBundled : t.onServer
}

export function CookielessSwitch({ state, bundled }: { state: Cookieless; bundled: boolean }) {
  const [asking, setAsking] = useState(false)
  const on = state.on === true
  const hint = hintOf(state, bundled)
  return (
    <div className="inst-cl">
      <div className="inst-row">
        <Switch on={on} label={t.label} disabled={state.on === null || state.saving || state.locked} onChange={() => setAsking(true)} />
        <span className="inst-row-label">{t.label}</span>
        {state.saving && <span className="btn-spin" aria-label={t.saving} />}
      </div>
      <p className="faint inst-cl-hint" aria-live="polite">
        {hint}
      </p>
      {asking && (
        <Suspense fallback={null}>
          <CookielessDialog
            on={on}
            onCancel={() => setAsking(false)}
            onConfirm={() => {
              setAsking(false)
              state.set(!on)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
