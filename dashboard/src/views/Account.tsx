// The account dialog: everything that belongs to the person, not to the site
// they happen to be looking at. It opens over whatever is on screen, so the
// Settings page can stay about one site.
import { Check, CircleUser, Copy, Eye, Globe, KeyRound, ShieldCheck, UserCheck, UserPlus, Users, X } from 'lucide-react'
import { Modal } from '../components/Modal'
import { checksHere, setChecksHere } from '../lib/update'
import { Switch } from '../components/Switch'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { api, type APIKey, type Person, type Profile, type TwoStep as TwoStepState } from '../lib/api'
import { settle, toast } from '../components/Toast'
import { closeAccount, openAccount, type AccountTab as Tab } from '../lib/account'
import { confirmWith, useConfirm } from '../components/Confirm'
import { Info } from '../components/Info'
import { Menu } from '../components/Menu'
import { Row } from '../components/Row'
import { THEMES, useTheme } from '../lib/theme'
import { isViewer } from '../lib/me'
import { SitesSettings } from './Sites'
import type { Site } from '../lib/api'
import { managed } from '../lib/managed'
import './Account.css'

// The setup wizard carries the QR encoder, so it is fetched only when someone
// actually turns two-step sign-in on.
const TwoStepSetup = lazy(() => import('./TwoStepSetup'))
const AvatarCrop = lazy(() => import('../components/AvatarCrop'))

const TABS: { id: Tab; label: string; owner?: true }[] = [
  { id: 'sites', label: 'Sites' },
  { id: 'keys', label: 'API keys', owner: true },
  { id: 'people', label: 'People', owner: true },
  { id: 'profile', label: 'Account' },
]

const ICONS: Record<Tab, typeof Globe> = {
  sites: Globe,
  keys: KeyRound,
  people: Users,
  profile: CircleUser,
}

function NavIcon({ id }: { id: Tab }) {
  const Icon = ICONS[id]
  return (
    <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
  )
}

export function AccountDialog({ tab, sites, email, onSites }: { tab: Tab; sites: Site[]; email?: string; onSites: () => void }) {
  return (
    <Modal label="Your account" className="account" onClose={closeAccount}>
      <header className="account-head">
        <span className="avatar" aria-hidden="true">
          {(email ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="account-who">
          <b>Your account</b>
          <span className="faint">{email}</span>
        </span>
        <button type="button" className="btn icon close" aria-label="Close" onClick={closeAccount}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

      <nav className="account-nav" role="tablist" aria-label="Account sections">
        {TABS.filter((t) => !(t.owner && isViewer())).map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => openAccount(t.id)}>
            <NavIcon id={t.id} />
            {t.label}
          </button>
        ))}
      </nav>

      <div key={tab} className="account-body">
        {tab === 'sites' && <SitesSettings sites={sites} onSites={onSites} />}
        {tab === 'keys' && <Keys />}
        {tab === 'people' && <People me={email} />}
        {tab === 'profile' && (
          <>
            <You email={email} />
            <section className="card" style={{ gap: 0 }}>
              <div className="card-head" style={{ paddingBottom: 10 }}>
                <h2>Signed in</h2>
              </div>
              <Row label={email ?? 'Signed in'} hint="This browser">
                <button type="button" className="btn" onClick={() => api.logout().finally(() => location.assign(managed() || '/login'))}>
                  Sign out
                </button>
              </Row>
              {/* On a managed instance the plan, billing and the account itself live with the provider. */}
              {managed() && (
                <Row label="Plan & account" hint="Your plan, usage, billing, and deleting the account">
                  <a className="btn" href={new URL('/account', managed()).href}>
                    Open
                  </a>
                </Row>
              )}
            </section>
            {/* On a managed instance the provider owns sign-in: no password or second step here. */}
            {!managed() && <ChangePassword />}
            {!managed() && <TwoStep />}
            <Appearance />
            {!managed() && !isViewer() && <Updates />}
          </>
        )}
      </div>
    </Modal>
  )
}

/** Your name and picture. Both live on this server: no avatar service is ever
 *  asked about your email address. */
function You({ email }: { email?: string }) {
  const [p, setP] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [v, bump] = useState(0) // cache-buster after a new picture
  const file = useRef<HTMLInputElement>(null)
  const [cropping, setCropping] = useState<File | null>(null)
  useEffect(() => {
    api
      .profile()
      .then((r) => {
        setP(r)
        setName(r.name)
      })
      .catch(() => {})
  }, [])

  // The crop dialog saves: it stays open with its button busy until the server
  // has the picture, and shows the error if it refuses.
  const upload = async (picture: Blob) => {
    await api.setAvatar(picture)
    toast('Picture updated')
    setP((old) => (old ? { ...old, has_avatar: true } : old))
    bump((n) => n + 1)
    setCropping(null)
    window.dispatchEvent(new CustomEvent('trckable:profile'))
  }

  return (
    <section className="card" style={{ gap: 0 }}>
      {cropping && (
        <Suspense fallback={null}>
          <AvatarCrop file={cropping} onCancel={() => setCropping(null)} onSave={upload} />
        </Suspense>
      )}
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>You</h2>
      </div>
      <Row label="Picture" hint="PNG, JPEG, WebP or GIF · you crop it before it is saved">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="avatar big" aria-hidden="true">
            {p?.has_avatar ? <img src={`/api/v1/account/avatar?v=${v}`} alt="" /> : (name || email || '?').slice(0, 1).toUpperCase()}
          </span>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setCropping(f)
              e.target.value = ''
            }}
          />
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            {p?.has_avatar ? 'Replace' : 'Upload'}
          </button>
          {p?.has_avatar && (
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                const id = toast('Removing…', 'busy')
                try {
                  await api.clearAvatar()
                  settle(id, 'Picture removed')
                  setP((old) => (old ? { ...old, has_avatar: false } : old))
                  window.dispatchEvent(new CustomEvent('trckable:profile'))
                } catch (e) {
                  settle(id, e instanceof Error ? e.message : 'Could not remove it', 'error')
                }
              }}
            >
              Remove
            </button>
          )}
        </div>
      </Row>
      <Row label="Name" hint="Shown instead of your email address">
        <input
          className="input"
          value={name}
          placeholder={email?.split('@')[0] ?? 'Your name'}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name === p?.name) return
            api
              .setName(name)
              .then((r) => {
                setP(r)
                toast('Name saved')
                window.dispatchEvent(new CustomEvent('trckable:profile'))
              })
              .catch((e: Error) => toast(e.message, 'error'))
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </Row>
    </section>
  )
}

function ChangePassword() {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="card"
      style={{ gap: 0 }}
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        setMsg(null)
        api
          .changePassword(cur, next)
          .then(() => (setCur(''), setNext(''), setMsg(null), toast('Password changed — other devices were signed out')))
          .catch((e: Error) => (setMsg(e.message), toast(e.message, 'error')))
          .finally(() => setBusy(false))
      }}
    >
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>Password</h2>
        {msg && <span className="faint">{msg}</span>}
      </div>
      <Row label="Current password">
        <input className="input" type="password" aria-label="Current password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
      </Row>
      <Row label="New password" hint="At least 12 characters">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" type="password" aria-label="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={12} required />
          <button type="submit" className="btn primary" disabled={busy || !cur || next.length < 12}>
            {busy ? 'Saving…' : 'Change'}
          </button>
        </div>
      </Row>
    </form>
  )
}

/** New versions: whether this dashboard tells you. The check itself is in
 *  lib/update.ts: this browser, once a day, nothing about the instance sent. */
function Updates() {
  const [on, setOn] = useState(checksHere())
  return (
    <section className="card" style={{ gap: 0 }}>
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>New versions</h2>
      </div>
      <Row label="Tell me when a new version is out" hint="Once a day this browser asks GitHub's list of releases. Nothing about this server is sent.">
        <Switch
          on={on}
          label="Tell me when a new version is out"
          onChange={() => {
            setChecksHere(!on)
            setOn(!on)
          }}
        />
      </Row>
    </section>
  )
}

/** Who may use this instance. Owners run it, viewers read it — that is the
 *  whole model, and it is enforced on the server, not here. */
function People({ me }: { me?: string }) {
  const { ask, dialog } = useConfirm()
  const [people, setPeople] = useState<Person[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [issued, setIssued] = useState<{ email: string; password: string; reset?: boolean } | null>(null)
  const load = () => api.people().then((r) => setPeople(r.people ?? []))
  useEffect(() => {
    load()
  }, [])

  const owners = people?.filter((p) => p.role === 'owner').length ?? 0
  const setRole = (p: Person, role: string) => {
    const id = toast(`Making ${p.email} ${role === 'owner' ? 'an owner' : 'a viewer'}…`, 'busy')
    api
      .setPersonRole(p.id, role)
      .then((r) => (settle(id, role === 'owner' ? `${p.email} can now run this instance` : `${p.email} can now only read`), setPeople(r.people ?? [])))
      .catch((e: Error) => settle(id, e.message, 'error'))
  }

  return (
    <section className="card" id="people" style={{ gap: 12 }}>
      <div className="card-head">
        <h2>People</h2>
        <Info text="An owner can change anything on this instance. A viewer can read every report and nothing else — no settings, no sites, no payments, no API keys. The server enforces it, not the page. Everyone looks after their own password and second step." />
        <button type="button" className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => setAdding(true)}>
          <UserPlus size={16} strokeWidth={1.75} aria-hidden="true" />
          Add someone
        </button>
      </div>

      <div className="people-list">
        {people?.map((p) => {
          const self = p.email === me
          return (
            <div key={p.id} className="person">
              <span className="person-avatar" aria-hidden="true">
                {(p.name || p.email).slice(0, 1).toUpperCase()}
              </span>
              <span className="person-text">
                <span className="person-name">
                  {p.name || p.email}
                  {self && <span className="faint"> (you)</span>}
                </span>
                <span className="person-sub">
                  {p.name ? p.email + ' · ' : ''}
                  {p.must_change ? 'has not chosen a password yet' : p.last_seen ? `last seen ${seen(p.last_seen)}` : 'never signed in'}
                </span>
              </span>
              <span className={'tag ' + (p.role === 'owner' ? 'on' : 'quiet')}>{p.role === 'owner' ? 'Owner' : 'Viewer'}</span>
              <span className={'tag ' + (p.two_step ? 'on' : 'quiet')} title={p.two_step ? 'Signs in with a password and an authenticator app' : 'Signs in with a password alone'}>
                {p.two_step ? <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" /> : null}
                {p.two_step ? 'Two-step' : 'Password only'}
              </span>
              <Menu label={`${p.email} options`}>
                {(close) => (
                  <>
                    {self ? (
                      <span className="menu-note">
                        You cannot change your own role: another owner can. Your password and two-step are under Account.
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={p.role === 'owner' && owners <= 1}
                          title={p.role === 'owner' && owners <= 1 ? 'The only owner: make someone else an owner first' : undefined}
                          onClick={() => (close(), setRole(p, p.role === 'owner' ? 'viewer' : 'owner'))}
                        >
                          {p.role === 'owner' ? 'Make a viewer' : 'Make an owner'}
                        </button>
                        {!managed() && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={async () => {
                              close()
                              let made: { email: string; password: string } | null = null
                              const ok = await ask({
                                title: `Reset ${p.email}'s password?`,
                                body: 'They are signed out everywhere, get a new one-time password from you, and choose their own at the next sign-in.',
                                confirmLabel: 'Reset password',
                                busyLabel: 'Resetting…',
                                run: () => api.resetPersonPassword(p.id).then((r) => (made = r)),
                              })
                              if (ok && made) (setIssued({ ...(made as { email: string; password: string }), reset: true }), load())
                            }}
                          >
                            Reset password
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          style={{ color: 'var(--down)' }}
                          onClick={async () => {
                            close()
                            const ok = await ask({
                              title: `Remove ${p.email}?`,
                              body: 'They are signed out everywhere straight away. Nothing they looked at is deleted.',
                              confirmLabel: 'Remove',
                              danger: true,
                              busyLabel: 'Removing…',
                              done: `${p.email} removed`,
                              run: () => api.removePerson(p.id),
                            })
                            if (ok) load()
                          }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </>
                )}
              </Menu>
            </div>
          )
        })}
        {!people && <div className="skeleton" style={{ height: 54 }} />}
      </div>

      {adding && (
        <AddPerson
          onClose={() => setAdding(false)}
          onAdded={(made) => {
            setAdding(false)
            load()
            if (made.password) setIssued(made)
          }}
        />
      )}
      {issued && <OneTimePassword {...issued} onClose={() => setIssued(null)} />}
      {dialog}
    </section>
  )
}

function seen(unix: number): string {
  const s = Math.max(0, Date.now() / 1000 - unix)
  if (s < 3600) return 'within the hour'
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

/** Adding someone: their email and what they may do. The password to pass on
 *  follows in its own dialog (OneTimePassword). */
function AddPerson({ onClose, onAdded }: { onClose: () => void; onAdded: (made: { email: string; password: string }) => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [signin, setSignin] = useState<{ email: string; url: string } | null>(null)

  const create = () => {
    setBusy(true)
    setErr(null)
    api
      .addPerson(email.trim(), role)
      .then((r) => {
        // A managed instance signs people in at the host: nothing to pass on.
        if (r.signin) setSignin({ email: r.person.email, url: r.signin })
        else onAdded({ email: r.person.email, password: r.password })
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false))
  }

  if (signin)
    return (
      <Modal label="They can sign in now" className="person-modal" onClose={onClose}>
        <div className="modal-head">
          <span className="modal-badge" aria-hidden="true">
            <UserCheck size={19} strokeWidth={1.75} />
          </span>
          <div>
            <h2>They can sign in now</h2>
            <span className="faint">
              {signin.email} signs in at {signin.url.replace(/^https?:\/\//, '')} with that email address. There is no password to send.
            </span>
          </div>
        </div>
        <div className="person-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    )

  return (
    <Modal label="Add someone" className="person-modal" onClose={busy ? undefined : onClose}>
      <form className="person-form" onSubmit={(e) => (e.preventDefault(), email.includes('@') && create())}>
        <div className="modal-head">
          <span className="modal-badge" aria-hidden="true">
            <UserPlus size={19} strokeWidth={1.75} />
          </span>
          <div>
            <h2>Add someone</h2>
            <span className="faint">They get a one-time password from you, and choose their own when they first sign in.</span>
          </div>
        </div>
        <label className="field">
          Email
          <input className="input" type="email" value={email} autoFocus placeholder="them@company.com" onChange={(e) => setEmail(e.target.value)} />
        </label>
        <div className="person-roles" role="radiogroup" aria-label="What they may do">
          {[
            { id: 'viewer', title: 'Viewer', hint: 'Reads every report. Changes nothing.', Icon: Eye },
            { id: 'owner', title: 'Owner', hint: 'Runs the instance: sites, payments, people.', Icon: ShieldCheck },
          ].map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={role === r.id} className="person-role" onClick={() => setRole(r.id)}>
              <span className={'icon-tile small' + (role === r.id ? ' accent' : '')}>
                <r.Icon size={15} strokeWidth={1.75} />
              </span>
              <span className="menu-text">
                <span className="menu-title">{r.title}</span>
                <span className="menu-sub">{r.hint}</span>
              </span>
            </button>
          ))}
        </div>
        {err && (
          <p className="confirm-err" role="alert">
            {err}
          </p>
        )}
        <div className="person-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !email.includes('@')}>
            {busy && <span className="btn-spin" aria-hidden="true" />}
            {busy ? 'Adding…' : 'Add them'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** A one-time password to pass on — for someone just added, or one whose
 *  password an owner reset. Shown once; trckable sends no email. */
function OneTimePassword({ email, password, reset, onClose }: { email: string; password: string; reset?: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState<'pw' | 'all' | null>(null)
  const copy = (what: 'pw' | 'all') => {
    const text = what === 'pw' ? password : `Sign in to trckable at ${location.origin} as ${email} with this one-time password: ${password}\nYou will choose your own right after.`
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what)
      setTimeout(() => setCopied(null), 1500)
    })
  }
  return (
    <Modal label="Their one-time password" className="person-modal" onClose={onClose}>
      <div className="modal-head">
        <span className="modal-badge" aria-hidden="true">
          <KeyRound size={19} strokeWidth={1.75} />
        </span>
        <div>
          <h2>{reset ? 'Their new one-time password' : 'Send them this password'}</h2>
          <span className="faint">
            Shown once. {email} signs in with it and chooses their own right away. trckable sends no email: pass it on however you like.
          </span>
        </div>
      </div>
      <div className="otp-box">
        <code>{password}</code>
        <button type="button" className="btn" onClick={() => copy('pw')}>
          {copied === 'pw' ? <Check size={15} strokeWidth={2} aria-hidden="true" /> : <Copy size={15} strokeWidth={1.75} aria-hidden="true" />}
          {copied === 'pw' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="person-actions">
        <button type="button" className="btn ghost" onClick={() => copy('all')}>
          {copied === 'all' ? 'Copied' : 'Copy with sign-in details'}
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}

/** Two-step sign-in: an authenticator app, plus one-time recovery codes. */
function TwoStep() {
  const [state, setState] = useState<TwoStepState | null>(null)
  const [setup, setSetup] = useState(false)
  const load = () => api.twoStep().then(setState).catch(() => {})
  useEffect(() => {
    load()
  }, [])

  const turnOff = async () => {
    const pw = await confirmWith({
      title: 'Turn off two-step sign-in?',
      body: 'Your account goes back to the password alone. Type it to confirm.',
      field: { label: 'Your password', type: 'password', autoComplete: 'current-password' },
      confirmLabel: 'Turn off',
      danger: true,
      busyLabel: 'Turning off…',
      done: 'Two-step sign-in is off',
      // A wrong password is said in the dialog, which stays open for another go.
      run: (pw) => api.disableTwoStep(pw),
    })
    if (pw !== null) load()
  }

  const on = state?.enabled === true
  const low = on && state.recovery_left <= 2
  return (
    <section className="card" id="two-step" style={{ gap: 0 }}>
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>Two-step sign-in</h2>
        <Info text="After your password, sign-in asks for a six-digit code from an authenticator app on your phone. The secret is generated and kept on this server — no SMS, no email, nobody else involved." />
        <span className={'tag' + (on ? ' on' : ' quiet')} style={{ marginLeft: 'auto' }}>
          {state ? (on ? 'On' : 'Off') : '…'}
        </span>
        {on && (
          <button type="button" className="btn" onClick={turnOff}>
            Turn off
          </button>
        )}
      </div>

      {!state && <div className="skeleton" style={{ height: 54 }} />}
      {state && !on && (
        <Row label="Authenticator app" hint="A password alone is one secret away from someone else's hands">
          <button type="button" className="btn primary" onClick={() => setSetup(true)}>
            Set up
          </button>
        </Row>
      )}
      {state && on && (
        <Row label="Recovery codes" hint={low ? 'Running low — turn it off and on again for a fresh set' : 'Each one signs you in once if you lose your phone'}>
          <span className="num" style={low ? { color: 'var(--down)' } : undefined}>
            {state.recovery_left} of 8 left
          </span>
        </Row>
      )}

      {setup && (
        <Suspense fallback={null}>
          <TwoStepSetup onClose={() => (setSetup(false), load())} onDone={load} />
        </Suspense>
      )}
    </section>
  )
}

function Keys() {
  const { ask, dialog } = useConfirm()
  const [keys, setKeys] = useState<APIKey[] | null>(null)
  const [creating, setCreating] = useState(false)
  const load = () => api.keys().then((r) => setKeys(r.keys ?? []))
  useEffect(() => {
    load()
  }, [])

  const MAX = 20
  const used = keys?.length ?? 0
  const when = (unix?: number) => (unix ? new Date(unix * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null)

  return (
    <section className="card" id="keys" style={{ gap: 12 }}>
      <div className="card-head">
        <h2>API keys</h2>
        <Info text="A key can read this instance's reports — nothing else. It cannot change a setting, a site or a payment. Give each tool its own key, so revoking one never touches the rest." />
        <span className="faint num" style={{ marginLeft: 'auto', fontSize: 12 }}>
          {used} of {MAX}
        </span>
        <button type="button" className="btn primary" disabled={used >= MAX} onClick={() => setCreating(true)}>
          New key
        </button>
      </div>

      <div className="keylist">
        {keys?.map((k) => (
          <div key={k.id} className="keyrow">
            <span className="keyrow-name">{k.name}</span>
            <span className="faint num keyrow-meta">
              {k.prefix}… · {k.last_used_at ? `used ${when(k.last_used_at)}` : 'never used'}
            </span>
            <Menu label={`${k.name} options`}>
              {(close) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close()
                      navigator.clipboard?.writeText(k.prefix)
                      toast('Prefix copied — the full key is shown only once')
                    }}
                  >
                    Copy prefix
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    style={{ color: 'var(--down)' }}
                    onClick={async () => {
                      close()
                      const ok = await ask({
                        title: `Revoke "${k.name}"?`,
                        body: k.last_used_at
                          ? 'Anything using this key stops working immediately, and this cannot be undone.'
                          : 'This key has never been used. Revoking it cannot be undone.',
                        confirmLabel: 'Revoke',
                        danger: true,
                        busyLabel: 'Revoking…',
                        done: 'Key revoked',
                        run: () => api.revokeKey(k.id),
                      })
                      if (ok) load()
                    }}
                  >
                    Revoke
                  </button>
                </>
              )}
            </Menu>
          </div>
        ))}
        {keys?.length === 0 && <span className="faint">No keys yet. Create one for your AI assistant or a script.</span>}
        {!keys && <div className="skeleton" style={{ height: 54 }} />}
      </div>

      {creating && <NewKey onClose={() => setCreating(false)} onCreated={load} />}
      {dialog}
    </section>
  )
}

/** Creating a key is two steps: what it is for, then copy it — once. */
function NewKey({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const SUGGEST = ['Claude', 'Cursor', 'A script of mine', 'My AI assistant']

  const create = () => {
    setBusy(true)
    setErr(null)
    api
      .createKey(name.trim() || 'API key')
      .then((r) => {
        setSecret(r.secret)
        onCreated()
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false))
  }

  return (
    <Modal label="New API key" className="wizard" onClose={secret ? undefined : onClose}>
      <div className="wiz-rail" aria-hidden="true">
        {['What for', 'Copy it'].map((label, i) => (
          <span key={label} className={secret ? (i === 1 ? 'on' : 'done') : i === 0 ? 'on' : ''}>
            <i />
            {label}
          </span>
        ))}
      </div>

      <div key={secret ? 'key' : 'name'} className="wiz-step">
        {!secret ? (
          <>
            <h2>What is this key for?</h2>
            <p className="muted" style={{ margin: 0 }}>
              A name you will recognise later. Each tool should have its own, so you can revoke one without breaking the others.
            </p>
            <input
              className="input"
              style={{ height: 48, fontSize: 15 }}
              value={name}
              maxLength={80}
              placeholder="Claude on my laptop"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SUGGEST.map((sg) => (
                <button key={sg} type="button" className="preset" onClick={() => setName(sg)}>
                  {sg}
                </button>
              ))}
            </div>
            {err && (
              <span role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
                {err}
              </span>
            )}
            <div className="wiz-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn primary big" disabled={busy} onClick={create}>
                {busy ? 'Creating…' : 'Create key'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Copy it now</h2>
            <p className="muted" style={{ margin: 0 }}>
              This is the only time the key is shown — trckable keeps just a hash of it.
            </p>
            <div className="keybox">
              <code>{secret}</code>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  navigator.clipboard?.writeText(secret).then(() => {
                    setCopied(true)
                    toast('Key copied')
                    setTimeout(() => setCopied(false), 1500)
                  })
                }
              >
                {copied ? 'Copied' : 'Copy key'}
              </button>
            </div>
            <span className="faint" style={{ fontSize: 12 }}>
              Paste it into your assistant's MCP config as TRCKABLE_API_KEY, or send it as an Authorization: Bearer header.
            </span>
            <div className="wiz-actions">
              <button type="button" className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function Appearance() {
  const [theme, pick] = useTheme()
  return (
    <section className="card" style={{ gap: 0 }}>
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>Appearance</h2>
      </div>
      <Row label="Theme" hint="System follows your device">
        <div className="seg" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t} type="button" aria-pressed={theme === t} onClick={() => pick(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </Row>
    </section>
  )
}



