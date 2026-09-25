// The account dialog: everything that belongs to the person, not to the site
// they happen to be looking at. It opens over whatever is on screen, so the
// Settings page can stay about one site.
import { BellRing, Camera, Check, CircleUser, Copy, CreditCard, Eye, EyeOff, Globe, ImageUp, KeyRound, LockKeyhole, LogOut, Pencil, ShieldCheck, SunMoon, Trash2, UserCheck, UserPlus, Users, X } from 'lucide-react'
import { Modal } from '../components/Modal'
import { StepBody } from '../components/StepBody'
import { Steps } from '../components/Steps'
import { checksHere, setChecksHere } from '../lib/update'
import { Switch } from '../components/Switch'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { api, type APIKey, type Person, type Profile, type TwoStep as TwoStepState } from '../lib/api'
import { settle, toast } from '../components/Toast'
import { closeAccount, openAccount, type AccountTab as Tab } from '../lib/account'
import { confirm, confirmWith, useConfirm } from '../components/Confirm'
import { DialogActions } from '../components/DialogActions'
import { RowLabel } from '../components/Switch'
import { Menu } from '../components/Menu'
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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [v, bump] = useState(0) // cache-buster after a new picture
  useEffect(() => {
    api.profile().then(setProfile).catch(() => {})
  }, [])
  return (
    <Modal label="Your account" className="account" onClose={closeAccount}>
      <header className="account-head">
        <Avatar p={profile} email={email} v={v} />
        <span className="account-who">
          <b>{profile?.name || 'Your account'}</b>
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
        {tab === 'profile' && <ProfileTab email={email} p={profile} v={v} onProfile={setProfile} onPicture={() => bump((n) => n + 1)} />}
      </div>
    </Modal>
  )
}

/** The picture you chose, or your initial. Both live on this server: no
 *  avatar service is ever asked about your email address. */
function Avatar({ p, email, v, size }: { p: Profile | null; email?: string; v: number; size?: 'big' | 'huge' }) {
  return (
    <span className={'avatar' + (size ? ' ' + size : '')} aria-hidden="true">
      {p?.has_avatar ? <img src={`/api/v1/account/avatar?v=${v}`} alt="" /> : (p?.name || email || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/** One line of the Account section: an icon, what it is, and its control. */
function Line({ icon: Icon, label, hint, children, id }: { icon: typeof Globe; label: string; hint?: React.ReactNode; children?: React.ReactNode; id?: string }) {
  return (
    <div className="srow acct-line" id={id}>
      <span className="icon-tile" aria-hidden="true">
        <Icon size={17} strokeWidth={1.75} />
      </span>
      <div className="srow-text">
        <b>{label}</b>
        {hint && <span className="faint">{hint}</span>}
      </div>
      {children && (
        <div className="srow-ctl">
          <RowLabel.Provider value={label}>{children}</RowLabel.Provider>
        </div>
      )}
    </div>
  )
}

function ProfileTab({ email, p, v, onProfile, onPicture }: { email?: string; p: Profile | null; v: number; onProfile: (p: Profile) => void; onPicture: () => void }) {
  const [theme, pick] = useTheme()
  const [updates, setUpdates] = useState(checksHere())
  const [pw, setPw] = useState(false)
  return (
    <>
      <Me email={email} p={p} v={v} onProfile={onProfile} onPicture={onPicture} />

      <section className="card acct-group">
        <h2 className="acct-title">Sign-in and security</h2>
        {/* On a managed instance the provider owns sign-in: no password or second step here. */}
        {managed() ? (
          <Line icon={CreditCard} label="Plan and account" hint="Your plan, usage, billing, and deleting the account">
            <a className="btn" href={new URL('/account', managed()).href}>
              Open
            </a>
          </Line>
        ) : (
          <>
            <Line icon={LockKeyhole} label="Password" hint="Changing it signs you out everywhere else">
              <button type="button" className="btn" onClick={() => setPw(true)}>
                Change password
              </button>
            </Line>
            <TwoStep />
          </>
        )}
        <Line icon={LogOut} label="This browser" hint={`Signed in as ${email ?? 'you'}`}>
          <button type="button" className="btn" onClick={() => api.logout().finally(() => location.assign(managed() || '/login'))}>
            Sign out
          </button>
        </Line>
      </section>

      <section className="card acct-group">
        <h2 className="acct-title">Preferences</h2>
        <Line icon={SunMoon} label="Theme" hint="System follows your device">
          <div className="seg" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => pick(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </Line>
        {/* The check itself is in lib/update.ts: this browser, once a day, nothing about the instance sent. */}
        {!managed() && !isViewer() && (
          <Line icon={BellRing} label="New versions" hint="Once a day this browser asks GitHub's list of releases. Nothing about this server is sent.">
            <Switch
              on={updates}
              label="Tell me when a new version is out"
              onChange={() => {
                setChecksHere(!updates)
                setUpdates(!updates)
              }}
            />
          </Line>
        )}
      </section>

      {pw && <PasswordDialog onClose={() => setPw(false)} />}
    </>
  )
}

/** Who you are here: your picture, your name, your role. */
function Me({ email, p, v, onProfile, onPicture }: { email?: string; p: Profile | null; v: number; onProfile: (p: Profile) => void; onPicture: () => void }) {
  const [name, setName] = useState(p?.name ?? '')
  const [saved, setSaved] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const [cropping, setCropping] = useState<File | null>(null)
  useEffect(() => setName(p?.name ?? ''), [p?.name])

  // The crop dialog saves: it stays open with its button busy until the server
  // has the picture, shows the error if it refuses, and says Saved before it
  // closes.
  const upload = (picture: Blob) => api.setAvatar(picture)
  const uploaded = () => {
    setCropping(null)
    toast('Picture updated')
    if (p) onProfile({ ...p, has_avatar: true })
    onPicture()
    window.dispatchEvent(new CustomEvent('trckable:profile'))
  }
  const remove = async () => {
    const ok = await confirm({
      title: 'Remove your picture?',
      body: 'Your initial is shown instead. You can add a picture again any time.',
      confirmLabel: 'Remove',
      busyLabel: 'Removing…',
      done: 'Picture removed',
      run: () => api.clearAvatar(),
    })
    if (ok && p) onProfile({ ...p, has_avatar: false })
    if (ok) window.dispatchEvent(new CustomEvent('trckable:profile'))
  }
  const saveName = () => {
    if (!p || name.trim() === p.name) return
    api
      .setName(name.trim())
      .then((r) => {
        onProfile(r)
        setSaved(true)
        setTimeout(() => setSaved(false), 1600)
        window.dispatchEvent(new CustomEvent('trckable:profile'))
      })
      .catch((e: Error) => toast(e.message, 'error'))
  }

  return (
    <section className="me-card">
      {cropping && (
        <Suspense fallback={null}>
          <AvatarCrop file={cropping} onCancel={() => setCropping(null)} onSave={upload} onDone={uploaded} />
        </Suspense>
      )}
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setCropping(f)
          e.target.value = ''
        }}
      />
      <button type="button" className="me-photo" onClick={() => file.current?.click()} aria-label={p?.has_avatar ? 'Replace your picture' : 'Add a picture'}>
        <Avatar p={p} email={email} v={v} size="huge" />
        <span className="me-cam" aria-hidden="true">
          <Camera size={14} strokeWidth={2} />
        </span>
      </button>
      <div className="me-text">
        <label className="me-name">
          <input
            value={name}
            placeholder={email?.split('@')[0] ?? 'Your name'}
            aria-label="Your name"
            title="Shown instead of your email address"
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          {saved ? <Check size={15} strokeWidth={2} className="me-saved" aria-label="Saved" /> : <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />}
        </label>
        <span className="me-email">{email}</span>
        <span className="me-meta">
          <span className={'tag' + (isViewer() ? ' quiet' : ' on')}>{isViewer() ? 'Viewer' : 'Owner'}</span>
        </span>
      </div>
      <div className="me-actions">
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          <ImageUp size={16} strokeWidth={1.75} aria-hidden="true" />
          {p?.has_avatar ? 'Replace' : 'Add picture'}
        </button>
        {p?.has_avatar && (
          <button type="button" className="btn ghost icon" aria-label="Remove your picture" title="Remove your picture" onClick={remove}>
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  )
}

/** A new password, in its own dialog: two fields and a meter, not two rows
 *  and a button squeezed beside the second one. */
function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const MIN = 12
  const fill = Math.min(1, next.length / MIN)
  const ok = next.length >= MIN
  const same = ok && next === cur
  const submit = () => {
    if (!cur || !ok || same) return
    setBusy(true)
    setErr(null)
    api
      .changePassword(cur, next)
      .then(() => (toast('Password changed — other devices were signed out'), onClose()))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false))
  }
  const Eyes = show ? EyeOff : Eye
  return (
    <Modal label="Change your password" className="person-modal" onClose={busy ? undefined : onClose}>
      <form className="person-form" onSubmit={(e) => (e.preventDefault(), submit())} aria-busy={busy}>
        <div className="modal-head">
          <span className="modal-badge" aria-hidden="true">
            <LockKeyhole size={19} strokeWidth={1.75} />
          </span>
          <div>
            <h2>Change your password</h2>
            <span className="faint">Every other browser and device is signed out. This one stays signed in.</span>
          </div>
        </div>
        <label className="field">
          Current password
          <input className="input" type="password" autoFocus autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </label>
        <label className="field">
          New password
          <span className="pw-field">
            <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={MIN} value={next} onChange={(e) => setNext(e.target.value)} />
            <button type="button" className="pw-eye" aria-label={show ? 'Hide the new password' : 'Show the new password'} aria-pressed={show} onClick={() => setShow(!show)}>
              <Eyes size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </span>
        </label>
        <div className={'pw-meter' + (ok ? ' ok' : '')} aria-live="polite">
          <span className="pw-bar">
            <span style={{ width: `${fill * 100}%` }} />
          </span>
          <span className="faint num">
            {same ? 'The same as the current one' : ok ? `${next.length} characters · long enough` : `${next.length} of ${MIN} characters`}
          </span>
        </div>
        {err && (
          <p className="confirm-err" role="alert">
            {err}
          </p>
        )}
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          }
        >
          <button type="submit" className="btn primary big" disabled={busy || !cur || !ok || same}>
            {busy && <span className="btn-spin" aria-hidden="true" />}
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </DialogActions>
      </form>
    </Modal>
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

  const reset = async (p: Person) => {
    let made: { email: string; password: string } | null = null
    const ok = await ask({
      title: `New sign-in details for ${p.email}?`,
      body: 'They are signed out everywhere, get a new one-time password from you, and choose their own at the next sign-in.',
      confirmLabel: 'Make new details',
      busyLabel: 'Resetting…',
      run: () => api.resetPersonPassword(p.id).then((r) => (made = r)),
    })
    if (ok && made) (setIssued({ ...(made as { email: string; password: string }), reset: true }), load())
  }
  const remove = async (p: Person) => {
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
  }

  // You first; then the people who use it; then the ones still to sign in.
  const waiting = (p: Person) => p.email !== me && (p.must_change || !p.last_seen)
  const sorted = [...(people ?? [])].sort((x, y) => (y.email === me ? 1 : 0) - (x.email === me ? 1 : 0) || (y.last_seen || 0) - (x.last_seen || 0))
  const active = sorted.filter((p) => !waiting(p))
  const pending = sorted.filter(waiting)
  const viewers = (people?.length ?? 0) - owners

  const row = (p: Person) => {
    const self = p.email === me
    return (
      <div key={p.id} className={'person' + (self ? ' self' : '')}>
        <span className={'person-avatar' + (p.role === 'owner' ? ' owner' : '')} aria-hidden="true">
          {(p.name || p.email).slice(0, 1).toUpperCase()}
        </span>
        <span className="person-text">
          <span className="person-name">
            {p.name || p.email.split('@')[0]}
            {self && <span className="you">You</span>}
          </span>
          <span className="person-sub">{p.email}</span>
          <span className="person-seen">
            {p.must_change ? 'Has not chosen a password yet' : p.last_seen ? `Last seen ${seen(p.last_seen)}` : 'Never signed in'}
            {waiting(p) && !managed() && (
              <button type="button" className="linkish person-quick" onClick={() => reset(p)}>
                New sign-in details
              </button>
            )}
          </span>
        </span>
        <span className="person-tags">
          <span className={'tag ' + (p.role === 'owner' ? 'on' : 'quiet')}>{p.role === 'owner' ? 'Owner' : 'Viewer'}</span>
          <span className={'tag ' + (p.two_step ? 'on' : 'quiet')} title={p.two_step ? 'Signs in with a password and an authenticator app' : 'Signs in with a password alone'}>
            {p.two_step && <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />}
            {p.two_step ? 'Two-step' : 'Password only'}
          </span>
        </span>
        <Menu label={`${p.email} options`}>
          {(close) =>
            self ? (
              <span className="menu-note">You cannot change your own role: another owner can. Your password and two-step are under Account.</span>
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
                  <button type="button" role="menuitem" onClick={() => (close(), reset(p))}>
                    Reset password
                  </button>
                )}
                <button type="button" role="menuitem" style={{ color: 'var(--down)' }} onClick={() => (close(), remove(p))}>
                  Remove
                </button>
              </>
            )
          }
        </Menu>
      </div>
    )
  }

  return (
    <section className="people" id="people">
      <div className="people-head">
        <span className="people-head-text">
          <h2>People</h2>
          <span className="faint">
            {people ? `${people.length} ${people.length === 1 ? 'person' : 'people'} · ${owners} owner${owners === 1 ? '' : 's'} · ${viewers} viewer${viewers === 1 ? '' : 's'}` : '…'}
          </span>
        </span>
        <button type="button" className="btn primary" onClick={() => setAdding(true)}>
          <UserPlus size={16} strokeWidth={1.75} aria-hidden="true" />
          Add someone
        </button>
        <div className="people-roles">
          <span>
            <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>
              <b>Owners</b> run the instance: sites, payments, people, keys.
            </span>
          </span>
          <span>
            <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>
              <b>Viewers</b> read every report and change nothing. The server enforces it.
            </span>
          </span>
        </div>
      </div>

      {!people && <div className="skeleton" style={{ height: 120 }} />}
      {active.length > 0 && <div className="people-list">{active.map(row)}</div>}
      {pending.length > 0 && (
        <div className="people-group">
          <span className="people-group-head">Waiting to sign in</span>
          <div className="people-list">{pending.map(row)}</div>
        </div>
      )}

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

/** Two-step sign-in: an authenticator app, plus one-time recovery codes. The
 *  secret is generated and kept on this server — no SMS, no email. */
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
  const hint = !state
    ? 'Checking…'
    : on
      ? (
          <>
            A code from your phone after the password ·{' '}
            <span className="num" style={low ? { color: 'var(--down)' } : undefined}>
              {state.recovery_left} of 8 recovery codes left
            </span>
            {low && ' — turn it off and on again for a fresh set'}
          </>
        )
      : 'A password alone is one secret away from someone else’s hands'
  return (
    <>
      <Line icon={ShieldCheck} id="two-step" label="Two-step sign-in" hint={hint}>
        {state && <span className={'tag' + (on ? ' on' : ' quiet')}>{on ? 'On' : 'Off'}</span>}
        {state &&
          (on ? (
            <button type="button" className="btn" onClick={turnOff}>
              Turn off
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => setSetup(true)}>
              Set up
            </button>
          ))}
      </Line>
      {setup && (
        <Suspense fallback={null}>
          <TwoStepSetup onClose={() => (setSetup(false), load())} onDone={load} />
        </Suspense>
      )}
    </>
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
    <section className="people" id="keys">
      <div className="people-head">
        <span className="people-head-text">
          <h2>API keys</h2>
          <span className="faint">
            <span className="num">
              {used} of {MAX}
            </span>{' '}
            in use
          </span>
        </span>
        <button type="button" className="btn primary" disabled={used >= MAX} onClick={() => setCreating(true)}>
          <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />
          New key
        </button>
        <span className="keys-bar" aria-hidden="true">
          <span style={{ width: `${(used / MAX) * 100}%` }} />
        </span>
        <div className="people-roles">
          <span>
            <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>
              A key <b>reads reports</b>, nothing else: no settings, sites or payments.
            </span>
          </span>
          <span>
            <KeyRound size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>One per tool (Claude, Cursor, a script), so revoking one leaves the rest.</span>
          </span>
        </div>
      </div>

      <div className="people-list">
        {keys?.map((k) => (
          <div key={k.id} className="person keyrow">
            <span className="person-avatar" aria-hidden="true">
              <KeyRound size={17} strokeWidth={1.75} />
            </span>
            <span className="person-text">
              <span className="person-name">{k.name}</span>
              <span className="person-seen num">
                {k.prefix}… · created {when(k.created_at)}
              </span>
            </span>
            <span className="person-tags">
              <span className={'tag ' + (k.last_used_at ? 'on' : 'quiet')}>{k.last_used_at ? `Used ${when(k.last_used_at)}` : 'Never used'}</span>
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
        {keys?.length === 0 && <span className="faint keys-empty">No keys yet. Create one for your AI assistant or a script.</span>}
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
      <Steps labels={['What for', 'Copy it']} at={secret ? 1 : 0} />

      <StepBody step={secret ? 'key' : 'name'}>
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
      </StepBody>
    </Modal>
  )
}
