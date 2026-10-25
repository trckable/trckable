import { FieldError, fieldProps } from '../../kit/FieldError'
import { wizard } from '../install/copy'
import { cleanDomain } from '../install/domain'
import { copy } from './copy'

export function SiteStep(p: { taken?: boolean; focusGo?: boolean; domain: string; onDomain: (d: string) => void; problem: string; busy: boolean; ready: boolean; onSubmit: () => void }) {
  return (
    <form
      className="ob-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (p.ready && !p.busy) p.onSubmit()
      }}
    >
      <label className="ob-label" htmlFor="ob-domain">
        {copy.site.domain}
      </label>
      <div className={p.problem ? 'ob-field bad' : 'ob-field'}>
        <span className="ob-prefix" aria-hidden="true">
          {copy.site.prefix}
        </span>
        <input
          id="ob-domain"
          className="ob-input"
          value={p.domain}
          onChange={(e) => p.onDomain(e.target.value)}
          onPaste={(e) => {
            // A pasted address becomes the bare host: no scheme, www or path.
            e.preventDefault()
            p.onDomain(cleanDomain(e.clipboardData.getData('text')))
          }}
          onBlur={() => p.domain.trim() && p.onDomain(cleanDomain(p.domain))}
          placeholder={copy.site.placeholder}
          autoFocus={!p.focusGo}
          required
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="url"
          inputMode="url"
          {...fieldProps('ob-domain-problem', p.problem)}
        />
      </div>
      <FieldError id="ob-domain-problem" error={p.problem} />
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
