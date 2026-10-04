// The second step after a provider signed someone in, for an instance that
// keeps the authenticator code (OIDC_REQUIRE_TOTP): the provider did the
// first step, this is the code.
import { useState, type SubmitEvent } from 'react'
import { api, messageOf } from '../lib/api'
import { Shell } from './AuthShell'
import { ssoCopy } from './ssoCopy'

export const wantsCode = () => new URLSearchParams(location.search).get('sso') === 'code'

/** Only a path on this site is opened, whatever the server sent. */
export const localPath = (to: string) => (to.startsWith('/') && !to.startsWith('//') && !to.includes('\\') ? to : '/')

export function SsoCode() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    api
      .ssoCode(code)
      .then((r) => location.assign(localPath(r.return_to)))
      .catch((err: unknown) => {
        setError(messageOf(err))
        setBusy(false)
      })
  }
  return (
    <Shell title={ssoCopy.stepTitle} sub={ssoCopy.stepSub}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">
          {ssoCopy.codeLabel}
          <input className="input num" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus autoComplete="one-time-code" maxLength={16} />
        </label>
        {error && (
          <div role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
            {error}
          </div>
        )}
        <button className="btn primary" type="submit" disabled={busy || code.trim().length < 6} style={{ height: 44, justifyContent: 'center' }}>
          {busy ? ssoCopy.confirming : ssoCopy.confirm}
        </button>
        <a className="linkish" style={{ fontSize: 12 }} href="/login">
          {ssoCopy.restart}
        </a>
      </form>
    </Shell>
  )
}
