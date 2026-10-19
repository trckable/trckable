import { wizard } from '../install/copy'
import { copy } from './copy'

export function SiteStep(p: { taken?: boolean; focusGo?: boolean; domain: string; onDomain: (d: string) => void; busy: boolean; ready: boolean; onSubmit: () => void }) {
  return (
    <form
      className="ob-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (p.ready && !p.busy) p.onSubmit()
      }}
    >
      <label className="ob-label" htmlFor="ob-domain">
        {copy.site.domain}
      </label>
      <input
        id="ob-domain"
        className="input ob-input"
        value={p.domain}
        onChange={(e) => p.onDomain(e.target.value)}
        placeholder={copy.site.placeholder}
        autoFocus={!p.focusGo}
        required
        spellCheck={false}
        autoCapitalize="none"
        autoComplete="url"
        inputMode="url"
      />
      {p.taken && <p className="faint">{wizard.taken}</p>}
      <div className="ob-actions">
        <button type="submit" className="btn primary big" autoFocus={p.focusGo} disabled={!p.ready || p.busy}>
          {p.busy && <span className="btn-spin" aria-hidden="true" />}
          {p.busy ? copy.site.busy : copy.site.go}
        </button>
        <span className="faint ob-enter" aria-hidden="true">
          {copy.site.enter}
        </span>
      </div>
    </form>
  )
}
