// The dialog's secondary way to share: a read-only link to the site, with
// an optional password and revenue off unless switched on. What the link may
// show is decided on the server: without revenue the figure is never read.
import { ArrowLeft, Check, Copy, Link2 } from 'lucide-react'
import { useState } from 'react'
import { api, fail, type Site } from '../../lib/api'
import { Switch } from '../../components/Switch'
import { toast } from '../../components/Toast'
import { copy } from './copy'

export function LinkPanel({ site, onBack }: { site: Site; onBack: () => void }) {
  const [password, setPassword] = useState('')
  const [revenue, setRevenue] = useState(false)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const create = () => {
    setBusy(true)
    api
      .createShare(site.id, { name: site.domain, password: password || undefined, revenue, days: 0 })
      .then((r) => setUrl(r.url))
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  const copyUrl = () =>
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      toast(copy.linkCopied)
    })
  return (
    <div className="sd-link">
      <button type="button" className="btn ghost sd-back" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
        {copy.back}
      </button>
      <h3>
        <Link2 size={17} strokeWidth={1.8} aria-hidden="true" />
        {copy.linkTitle}
      </h3>
      {!url && (
        <>
          <label className="field">
            {copy.password}
            <input className="input" type="password" autoComplete="new-password" placeholder={copy.passwordHint} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="sd-toggle">
            <span>{copy.revenue}</span>
            <Switch on={revenue} label={copy.revenue} onChange={() => setRevenue((x) => !x)} />
          </label>
          <button type="button" className="btn primary" disabled={busy} onClick={create}>
            {busy && <span className="btn-spin" aria-hidden="true" />}
            {copy.create}
          </button>
        </>
      )}
      {url && (
        <div className="sd-url">
          <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn primary" onClick={copyUrl}>
            {copied && <Check size={16} strokeWidth={2.4} aria-hidden="true" />}
            {!copied && <Copy size={16} strokeWidth={1.8} aria-hidden="true" />}
            {copy.copyLink}
          </button>
        </div>
      )}
      <span className="faint sd-manage">{copy.manage}</span>
    </div>
  )
}
