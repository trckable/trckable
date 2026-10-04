// The look of a site's share links, on the dialog's Link panel: the owner's
// own logo, a colour, whether trckable's name is left off, and a domain the
// links open on. The preview beside it draws the same state (useLook.ts).
import { useRef } from 'react'
import { Info } from '../../components/Info'
import { Switch } from '../../components/Switch'
import { copy } from './copy'
import type { Look } from './useLook'

export function LookPanel({ state }: { state: Look }) {
  const { look, domain, setDomain, edit } = state
  const file = useRef<HTMLInputElement>(null)
  if (!look) return null

  return (
    <div className="sd-look">
      <h3>
        {copy.look}
        <Info text={copy.lookInfo} />
      </h3>
      <div className="sd-look-row">
        <span>{copy.logo}</span>
        {look.logo_url && <img className="sd-logo" src={look.logo_url} alt="" />}
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/svg+xml"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) edit.upload(f)
            e.target.value = ''
          }}
        />
        <button type="button" className="btn" title={copy.logoHint} onClick={() => file.current?.click()}>
          {copy.upload}
        </button>
        {look.logo_url && (
          <button type="button" className="btn ghost" onClick={edit.removeLogo}>
            {copy.remove}
          </button>
        )}
      </div>
      <div className="sd-look-row">
        <label htmlFor="sd-colour">{copy.colour}</label>
        <input id="sd-colour" className="sd-colour" type="color" value={look.color || '#b8ff3c'} onChange={(e) => edit.colour(e.target.value)} />
        {look.color && (
          <button type="button" className="btn ghost" onClick={() => edit.colour('')}>
            {copy.resetColour}
          </button>
        )}
      </div>
      <label className="sd-toggle">
        <span>{copy.hideBrand}</span>
        <Switch on={look.hide_brand} label={copy.hideBrand} onChange={edit.flip} />
      </label>
      <label className="field">
        <span className="sd-look-label">
          {copy.domain}
          <Info text={copy.cnameInfo} />
        </span>
        <input
          className="input"
          aria-label={copy.domain}
          value={domain}
          placeholder={copy.domainHint}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDomain(e.target.value)}
          onBlur={edit.commitDomain}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>
      {look.domain && !look.domain_ok && (
        <div className="sd-verify">
          <code className="sd-cname">{copy.txt(look.verify_name ?? '', look.verify_value ?? '')}</code>
          <button type="button" className="btn" onClick={edit.verify}>
            {copy.check}
          </button>
        </div>
      )}
      {look.domain && look.domain_ok && (
        <div className="sd-verify">
          <code className="sd-cname">{copy.cname(look.domain, look.target)}</code>
          <span className="faint">{copy.verified}</span>
        </div>
      )}
    </div>
  )
}
