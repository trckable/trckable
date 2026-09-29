// Cookieless mode, right beside the code. Either way it asks first, with the
// same comparison in the direction of the change. The setting is
// the site's own, so the script tag never changes: only bundled installs,
// which never load the server's script, carry it in their code.
import { lazy, Suspense, useState } from 'react'
import { copy } from './copy'
import type { Cookieless } from './useCookieless'

const CookielessDialog = lazy(() => import('./CookielessDialog').then((m) => ({ default: m.CookielessDialog })))
const t = copy.cookieless

function hintOf(on: boolean, bundled: boolean): string {
  if (bundled) return on ? t.onBundled : t.offBundled
  return on ? t.onServer : t.offServer
}

export function CookielessSwitch({ state, bundled }: { state: Cookieless; bundled: boolean }) {
  const [asking, setAsking] = useState(false)
  const on = state.on === true
  return (
    <div className="inst-cl">
      <label className="inst-cl-label">
        <input type="checkbox" checked={on} disabled={state.on === null || state.saving || state.locked} onChange={() => setAsking(true)} />
        <span>
          <b>{t.label}</b>
          <span className="faint">{t.hint}</span>
        </span>
        {state.saving && <span className="btn-spin" aria-label={t.saving} />}
      </label>
      <p className="faint inst-cl-hint" aria-live="polite">
        {state.locked ? t.viewer : hintOf(on, bundled)}
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
