// The look of a site's share links, on the dialog's Link panel: the owner's
// own logo, a colour, whether trckable's name is left off, and a domain the
// links open on. Each change is saved as it is made. The server cleans and
// limits the logo; this only keeps the obvious mistakes from a round trip.
import { useEffect, useRef, useState } from 'react'
import { APIError, fail, more, type ShareLook, type Site } from '../../lib/apiMore'
import { Info } from '../../components/Info'
import { Switch } from '../../components/Switch'
import { toast } from '../../components/Toast'
import { copy } from './copy'

const MAX_LOGO = 128 << 10

export function LookPanel({ site }: { site: Site }) {
  const [look, setLook] = useState<ShareLook | null>(null)
  const [domain, setDomain] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const timer = useRef(0)
  const latest = useRef<ShareLook | null>(null)
  useEffect(() => {
    latest.current = look
  })
  useEffect(() => {
    let stale = false
    more
      .shareLook(site.id)
      .then((l) => {
        if (stale) return
        setLook(l)
        setDomain(l.domain)
      })
      .catch(() => undefined)
    return () => {
      stale = true
      clearTimeout(timer.current)
    }
  }, [site.id])
  if (!look) return null

  // Every save carries the whole look as it is now, so one that was waiting
  // (the colour's) cannot undo a switch flipped after it.
  const save = (next: Pick<ShareLook, 'color' | 'hide_brand' | 'domain'>, said?: string) => {
    clearTimeout(timer.current)
    return more
      .setShareLook(site.id, next)
      .then((l) => {
        // Only a domain's save takes the answer: the tidied name. Any other
        // answer may be older than what was typed or picked since.
        if (!said) return
        setLook((p) => (p ? { ...p, domain: l.domain, target: l.target } : l))
        setDomain(l.domain)
        toast(said)
      })
      .catch((e: unknown) => {
        if (said) toast(copy.domainRefused, 'error')
        else fail(e)
        setDomain((now) => (now === next.domain ? look.domain : now)) // unless something else was typed meanwhile
      })
  }
  const pick = (color: string) => {
    setLook({ ...look, color })
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const now = latest.current
      if (now) void save({ color: now.color, hide_brand: now.hide_brand, domain: now.domain })
    }, 500)
  }
  const flip = () => {
    setLook({ ...look, hide_brand: !look.hide_brand })
    void save({ color: look.color, hide_brand: !look.hide_brand, domain: look.domain })
  }
  const upload = (f: File) => {
    if (f.size > MAX_LOGO) return toast(copy.logoBig, 'error')
    more
      .setShareLogo(site.id, f)
      .then(() => more.shareLook(site.id))
      .then(setLook)
      .catch((e: unknown) => (e instanceof APIError && e.status === 400 ? toast(copy.logoRefused, 'error') : fail(e)))
  }
  const remove = () => more.clearShareLogo(site.id).then(setLook).catch((e: unknown) => fail(e))

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
            if (f) upload(f)
            e.target.value = ''
          }}
        />
        <button type="button" className="btn" title={copy.logoHint} onClick={() => file.current?.click()}>
          {copy.upload}
        </button>
        {look.logo_url && (
          <button type="button" className="btn ghost" onClick={() => void remove()}>
            {copy.remove}
          </button>
        )}
      </div>
      <div className="sd-look-row">
        <label htmlFor="sd-colour">{copy.colour}</label>
        <input id="sd-colour" className="sd-colour" type="color" value={look.color || '#b8ff3c'} onChange={(e) => pick(e.target.value)} />
        {look.color && (
          <button type="button" className="btn ghost" onClick={() => pick('')}>
            {copy.resetColour}
          </button>
        )}
      </div>
      <label className="sd-toggle">
        <span>{copy.hideBrand}</span>
        <Switch on={look.hide_brand} label={copy.hideBrand} onChange={() => flip()} />
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
          onBlur={() => domain.trim() !== look.domain && void save({ color: look.color, hide_brand: look.hide_brand, domain }, copy.domainSaved)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>
      {look.domain && <code className="sd-cname">{copy.cname(look.domain, look.target)}</code>}
    </div>
  )
}
