// The first sign-in with a password someone else chose.
import { Suspense, lazy, useState, type SubmitEvent } from 'react'
import { messageOf, more } from '../lib/apiMore'
import { Shell } from './AuthShell'
import './Auth.css'

const TwoStepSetup = lazy(() => import('./TwoStepSetup'))

/** The first sign-in with a password someone else chose (a new person, or a
 *  reset): choose your own, then — the moment it is easiest to say yes — the
 *  offer of a second step with an authenticator app. */
export function FirstPassword({ email, onDone }: { email?: string; onDone: () => void }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<'password' | 'second' | 'setup'>('password')
  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    if (password !== again) {
      setError('The two new passwords are not the same.')
      return
    }
    setBusy(true)
    setError(null)
    more
      .changePassword(current, password)
      // Two-step only for someone who has not got it: an owner's reset leaves
      // it on, and offering it again would say it was gone.
      .then(() =>
        more
          .twoStep()
          .then((t) => (t.enabled ? onDone() : setStage('second')))
          .catch(() => setStage('second')),
      )
      .catch((err: unknown) => setError(messageOf(err)))
      .finally(() => setBusy(false))
  }
  if (stage === 'setup')
    return (
      <Suspense fallback={null}>
        <TwoStepSetup onClose={onDone} onDone={onDone} />
      </Suspense>
    )
  if (stage === 'second')
    return (
      <Shell title="Add a second step?" sub="Your password is yours now.">
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          With an authenticator app on your phone, signing in also asks for a six-digit code, so a password alone is not enough to get in. It takes a
          minute: scan a code, type the six digits it shows.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onDone}>
            Not now
          </button>
          <button type="button" className="btn primary" onClick={() => setStage('setup')}>
            Set up two-step
          </button>
        </div>
      </Shell>
    )
  return (
    <Shell title="Choose your own password" sub={email ? `You signed in as ${email} with a one-time password.` : 'You signed in with a one-time password.'}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">
          The one-time password
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        </label>
        <label className="field">
          Your new password
          <input className="input" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          The same again
          <input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        <span className="faint" style={{ fontSize: 12.5 }}>
          At least 12 characters. A few unrelated words make a strong one that is easy to remember.
        </span>
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--down)', fontSize: 13 }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn primary big" disabled={busy || !current || password.length < 12 || !again}>
          {busy ? 'Saving…' : 'Save my password'}
        </button>
      </form>
    </Shell>
  )
}
