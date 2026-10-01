import { copy } from './copy'

export function SiteStep(p: { domain: string; onDomain: (d: string) => void; busy: boolean; ready: boolean; onSubmit: () => void }) {
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
        autoFocus
        required
        spellCheck={false}
        autoCapitalize="none"
        autoComplete="url"
        inputMode="url"
      />
      <div className="ob-actions">
        <button type="submit" className="btn primary big" disabled={!p.ready || p.busy}>
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
