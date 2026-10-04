// First-run setup (guarded by the one-time token from the server log, passed
// in the URL fragment so it never reaches access logs) and sign-in.
import { useEffect, useState, type SubmitEvent } from 'react'
import { api, APIError, messageOf, type Site, more } from '../lib/apiMore'
import { browserZone } from '../lib/dates'
import { Shell } from './AuthShell'
import { SignInWith } from './SignInWith'
import { SsoCode, wantsCode } from './SsoCode'
import './Auth.css'

const hashToken = () => new URLSearchParams(location.hash.slice(1)).get('token') ?? ''

export function Setup({ onDone }: { onDone: (site: Site | null) => void }) {
  const [fromHash, setFromHash] = useState(hashToken)
  const [token, setToken] = useState(fromHash)
  useEffect(() => {
    // A pasted setup link can arrive as a hash-only change after the app loaded.
    const onHash = () => {
      const t = hashToken()
      setFromHash(t)
      if (t) setToken(t)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // A setup link may carry the address it was made for (#token=…&email=…),
  // so nobody types it twice.
  const [email, setEmail] = useState(() => new URLSearchParams(location.hash.slice(1)).get('email') ?? '')
  const [password, setPassword] = useState('')
  const [domain, setDomain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    api
      .setup(token.trim(), email.trim(), password, domain.trim())
      .then(async (r) => {
        history.replaceState(null, '', '/') // drop the token from the address bar
        // Reports count days in the site's timezone; start from the owner's.
        const site = r.site ? await more.updateSite(r.site.id, { timezone: browserZone() }).catch(() => r.site) : null
        onDone(site)
      })
      .catch((e: unknown) => setError(messageOf(e)))
      .finally(() => setBusy(false))
  }

  return (
    <Shell title="Welcome to trckable" sub="Create the owner account. This page works once; after that it's a normal sign-in.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!fromHash && (
          <label className="field">
            Setup token
            <input className="input num" value={token} onChange={(e) => setToken(e.target.value)} required autoComplete="off" placeholder="tkb_setup_…" />
            <span className="faint" style={{ fontSize: 12 }}>
              Printed in the server log on first start, or set as TRCKABLE_SETUP_TOKEN.
            </span>
          </label>
        )}
        <label className="field">
          Email
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
        </label>
        <label className="field">
          Password
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" />
          <span className="faint" style={{ fontSize: 12 }}>
            At least 10 characters.
          </span>
        </label>
        <label className="field">
          Your website
          <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" autoComplete="off" />
          <span className="faint" style={{ fontSize: 12 }}>
            Optional. You can add more sites later.
          </span>
        </label>
        {error && (
          <div role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
            {error}
          </div>
        )}
        <button className="btn primary" type="submit" disabled={busy} style={{ height: 44, justifyContent: 'center' }}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </Shell>
  )
}

export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  // The second step only appears once the server says this account has one, so
  // an account without it never sees an extra field.
  const [step, setStep] = useState<'password' | 'code'>('password')
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    api
      .login(email.trim(), password, step === 'code' ? code : undefined)
      .then(onDone)
      .catch((err: unknown) => {
        if (err instanceof APIError && err.needsCode) {
          setStep('code')
          setError(code ? err.message : null) // arriving here is not an error; a wrong code is
          setCode('')
        } else setError(messageOf(err))
      })
      .finally(() => setBusy(false))
  }
  let ready = email.length > 0 && password.length > 0
  if (step === 'code') ready = recovery ? code.trim().length > 0 : code.replace(/\D/g, '').length === 6
  let label = step === 'code' ? 'Confirm' : 'Sign in'
  if (busy) label = 'Signing in…'
  if (wantsCode()) return <SsoCode />
  return (
    <Shell title={step === 'code' ? 'One more step' : 'Sign in'} sub={step === 'code' ? 'Your password checked out.' : 'Peekaboo. Every visit counted.'}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {step === 'password' ? (
          <>
            <label className="field">
              Email
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
            </label>
            <label className="field">
              Password
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </label>
          </>
        ) : (
          <>
            <label className="field">
              {recovery ? 'Recovery code' : 'Six-digit code'}
              <input
                className="input num"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                inputMode={recovery ? 'text' : 'numeric'}
                autoComplete={recovery ? 'off' : 'one-time-code'}
                maxLength={recovery ? 16 : 7}
                placeholder={recovery ? 'one of the codes you saved' : '123456'}
                style={{ letterSpacing: recovery ? undefined : '0.25em', fontSize: 17 }}
              />
            </label>
            <span className="faint" style={{ fontSize: 12 }}>
              {recovery ? 'Each recovery code works once. No codes left? An owner can turn your two-step off.' : 'From your authenticator app.'}{' '}
              <button
                type="button"
                className="linkish"
                onClick={() => {
                  setRecovery(!recovery)
                  setCode('')
                  setError(null)
                }}
              >
                {recovery ? 'Use the app instead' : 'Lost your phone?'}
              </button>
            </span>
          </>
        )}
        {error && (
          <div role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
            {error}
          </div>
        )}
        <button className="btn primary" type="submit" disabled={busy || !ready} style={{ height: 44, justifyContent: 'center' }}>
          {label}
        </button>
        {step === 'code' ? (
          <button
            type="button"
            className="linkish"
            style={{ fontSize: 12 }}
            onClick={() => {
              setStep('password')
              setPassword('')
              setCode('')
              setError(null)
            }}
          >
            ← Back
          </button>
        ) : (
          <span className="faint" style={{ fontSize: 12, lineHeight: 1.5 }}>
            Forgot it? Ask an owner for new sign-in details. The owner of the server can run <span className="num">trckabled admin reset-password &lt;email&gt;</span>.
          </span>
        )}
      </form>
      {step === 'password' && <SignInWith />}
    </Shell>
  )
}
