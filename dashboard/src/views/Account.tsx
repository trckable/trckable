// The account dialog: everything that belongs to the person, not to the site
// they happen to be looking at. It opens over whatever is on screen, so the
// Settings page can stay about one site.
import { BellRing, Camera, Check, Copy, Eye, EyeOff, ImageUp, KeyRound, LockKeyhole, LogOut, ShieldCheck, SunMoon, Trash2, UserPlus, X } from 'lucide-react'
import { Modal } from '../components/Modal'
import { checksHere, setChecksHere } from '../lib/update'
import { Switch } from '../components/Switch'
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, messageOf, type Person, type Profile, type TwoStep as TwoStepState, type Site } from '../lib/api'
import { settle, toast } from '../components/Toast'
import { closeAccount, openAccount, type AccountTab as Tab } from '../lib/account'
import { confirm, confirmWith, useConfirm } from '../components/Confirm'
import { DialogActions } from '../components/DialogActions'
import { Menu } from '../components/Menu'
import { THEMES, useTheme } from '../lib/theme'
import { isViewer } from '../lib/me'
import { SitesSettings } from './Sites'
import { InlineEdit } from '../components/InlineEdit'
import { signOut } from '../lib/signOut'
import { useWindowTabs } from './accountTabs'
import { copy as acopy } from './account/copy'
import { Line } from './AccountLine'
import { AccessTag } from '../features/access/AccessTag'
import { seenText } from './personSeen'
import { useSiteAccess } from '../features/access/useSiteAccess'
import './Account.css'
import { Keys } from './account/Keys'
import { Loading } from '../components/loading/Loading'

// The setup wizard carries the QR encoder, so it is fetched only when someone
// actually turns two-step sign-in on.
const TwoStepSetup = lazy(() => import('./TwoStepSetup'))
const AvatarCrop = lazy(() => import('../components/AvatarCrop'))

export function AccountDialog({ tab: asked, sites, email, onSites }: { tab: Tab; sites: Site[]; email?: string; onSites: () => void }) {
  const { tabs, tab } = useWindowTabs(asked)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [v, bump] = useState(0) // cache-buster after a new picture
  useEffect(() => {
    api.profile().then(setProfile).catch(() => {})
  }, [])
  return (
    <Modal label={acopy.accountLabel} className="account" onClose={closeAccount}>
      <header className="account-head">
        <Avatar p={profile} email={email} v={v} />
        <span className="account-who">
          <span className="account-title">{acopy.account}</span>{profile?.name && <b>{profile.name}</b>}
          <span className="faint">{email}</span>
        </span>
        <button type="button" className="btn icon close" aria-label="Close" onClick={closeAccount}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

      <div className="account-nav" role="tablist" aria-label="Account sections">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => openAccount(t.id)}>
            <t.icon size={18} strokeWidth={1.75} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {/* A viewer sent to an owner's tab (Ask's "Create a key") lands on their own account. */}
      <div key={tab} className="account-body">
        {tab === 'sites' && <SitesSettings sites={sites} onSites={onSites} />}
        {tab === 'keys' && !isViewer() && <Keys />}
        {tab === 'people' && !isViewer() && <People me={email} />}
        {(tab === 'profile' || (isViewer() && (tab === 'keys' || tab === 'people'))) && <ProfileTab email={email} p={profile} v={v} onProfile={setProfile} onPicture={() => bump((n) => n + 1)} />}
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

interface ProfileProps {
  email?: string
  p: Profile | null
  v: number
  onProfile: (p: Profile) => void
  onPicture: () => void
}

function ThemeLine() {
  const [theme, pick] = useTheme()
  return (
    <Line icon={SunMoon} label="Theme" hint="System follows your device">
      <div className="seg" role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <button key={t} type="button" aria-pressed={theme === t} onClick={() => pick(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    </Line>
  )
}

function ProfileTab({ email, p, v, onProfile, onPicture }: ProfileProps) {
  const [updates, setUpdates] = useState(checksHere())
  const [pw, setPw] = useState(false)
  return (
    <>
      <Me email={email} p={p} v={v} onProfile={onProfile} onPicture={onPicture} />

      <section className="card acct-group">
        <h2 className="acct-title">Sign-in and security</h2>
        <Line icon={LockKeyhole} label="Password" hint="Changing it signs you out everywhere else">
          <button type="button" className="btn" onClick={() => setPw(true)}>
            Change password
          </button>
        </Line>
        <TwoStep />
        <Line icon={LogOut} label="This browser" hint={`Signed in as ${email ?? 'you'}`}>
          <button type="button" className="btn" onClick={() => signOut()}>
            Sign out
          </button>
        </Line>
      </section>

      <section className="card acct-group">
        <h2 className="acct-title">Preferences</h2>
        <ThemeLine />
        {/* The check itself is in lib/update.ts: this browser, once a day, nothing about the instance sent. */}
        {!isViewer() && (
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
  const file = useRef<HTMLInputElement>(null)
  const [cropping, setCropping] = useState<File | null>(null)

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
        <InlineEdit
          size="lg"
          label="Your name"
          value={p?.name ?? ''}
          placeholder={email?.split('@')[0] ?? 'Your name'}
          onSave={(n) =>
            api.setName(n).then((r) => {
              onProfile(r)
              window.dispatchEvent(new CustomEvent('trckable:profile'))
            })
          }
        />
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

/** What the new-password meter says under the bar. */
function meterText(same: boolean, ok: boolean, length: number, min: number): string {
  if (same) return 'The same as the current one'
  return ok ? `${length} characters · long enough` : `${length} of ${min} characters`
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
      .then(() => {
        toast('Password changed — other devices were signed out')
        onClose()
      })
      .catch((e: unknown) => setErr(messageOf(e)))
      .finally(() => setBusy(false))
  }
  const Eyes = show ? EyeOff : Eye
  return (
    <Modal label="Change your password" className="person-modal" onClose={busy ? undefined : onClose}>
      <form
        className="person-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        aria-busy={busy}
      >
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
            {meterText(same, ok, next.length, MIN)}
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
  const access = useSiteAccess(people)
  useEffect(() => {
    void load()
  }, [])

  const owners = people?.filter((p) => p.role === 'owner').length ?? 0
  const setRole = (p: Person, role: string) => {
    const id = toast(`Making ${p.email} ${role === 'owner' ? 'an owner' : 'a viewer'}…`, 'busy')
    api
      .setPersonRole(p.id, role)
      .then((r) => {
        settle(id, role === 'owner' ? `${p.email} can now run this instance` : `${p.email} can now only read`)
        setPeople(r.people ?? [])
      })
      .catch((e: unknown) => settle(id, messageOf(e), 'error'))
  }

  // Acting on someone else's sign-in takes your password and, when your own
  // two-step is on, a code too: a borrowed owner session plus a password
  // must not be enough to take another person's account. Asked one after the
  // other (one dialog at a time), the code last, where the action runs.
  const asOwner = async <T,>(o: { title: string; body: string; confirmLabel: string; busyLabel: string; done?: string; danger?: boolean }, act: (mine: string, code?: string) => Promise<T>) => {
    // Not known (a failed read): ask for the code anyway; the server ignores it when two-step is off.
    const on = await api.twoStep().then((s) => s.enabled).catch(() => true)
    if (!on) return confirmWith({ ...o, field: { label: 'Your password', type: 'password', autoComplete: 'current-password' }, run: (mine) => act(mine) })
    const mine = await confirmWith({ ...o, done: undefined, busyLabel: undefined, confirmLabel: 'Next', field: { label: 'Your password', type: 'password', autoComplete: 'current-password' } })
    if (mine === null) return null
    return confirmWith({
      ...o,
      title: 'A code from your app',
      body: 'Your own two-step is on: the six digits your authenticator shows now, or one of your recovery codes.',
      field: { label: 'Code', type: 'text', autoComplete: 'one-time-code' },
      run: (code) => act(mine, code),
    })
  }

  const reset = async (p: Person) => {
    let made: { email: string; password: string } | null = null
    const pw = await asOwner(
      {
        title: `New sign-in details for ${p.email}?`,
        body: 'They are signed out everywhere, get a new one-time password from you, and choose their own at the next sign-in. Type your own password to confirm.',
        confirmLabel: 'Make new details',
        busyLabel: 'Resetting…',
      },
      (mine, code) => api.resetPersonPassword(p.id, mine, code).then((r) => (made = r)),
    )
    if (pw !== null && made) {
      setIssued({ ...(made as { email: string; password: string }), reset: true })
      void load()
    }
  }
  // Lost phone, no recovery codes: they sign in with the password alone and
  // set two-step up again.
  const turnOff = async (p: Person) => {
    const pw = await asOwner(
      {
        title: `Turn off two-step for ${p.email}?`,
        body: 'For a lost phone with no recovery codes left: they sign in with their password alone, then set two-step up again. Type your own password to confirm.',
        confirmLabel: 'Turn off two-step',
        danger: true,
        busyLabel: 'Turning off…',
        done: `Two-step is off for ${p.email}`,
      },
      (mine, code) => api.turnOffTwoStepFor(p.id, mine, code),
    )
    if (pw !== null) void load()
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
    if (ok) void load()
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
            {seenText(p)}
            {waiting(p) && p.role !== 'owner' && (
              <button type="button" className="linkish person-quick" onClick={() => reset(p)}>
                New sign-in details
              </button>
            )}
          </span>
        </span>
        <span className="person-tags">
          <span className={'tag ' + (p.role === 'owner' ? 'on' : 'quiet')}>{p.role === 'owner' ? 'Owner' : 'Viewer'}</span>
          {p.role !== 'owner' && <AccessTag id={p.id} access={access} />}
          <span className={'tag ' + (p.two_step ? 'on' : 'quiet')} title={p.two_step ? 'Signs in with a password and an authenticator app' : 'Signs in with a password alone'}>
            {p.two_step && <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />}
            {p.two_step ? 'Two-step' : 'Password only'}
          </span>
        </span>
        <Menu label={`${p.email} options`}>
          {(close) =>
            self ? (
              <>
                <button type="button" role="menuitem" onClick={() => {
                  close()
                  openAccount('profile')
                }}>
                  Your account settings
                </button>
                <span className="menu-note">Your own role is changed by another owner.</span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  disabled={p.role === 'owner' && owners <= 1}
                  title={p.role === 'owner' && owners <= 1 ? 'The only owner: make someone else an owner first' : undefined}
                  onClick={() => {
                    close()
                    setRole(p, p.role === 'owner' ? 'viewer' : 'owner')
                  }}
                >
                  {p.role === 'owner' ? 'Make a viewer' : 'Make an owner'}
                </button>
                {p.role !== 'owner' && (
                  <button type="button" role="menuitem" onClick={() => (close(), reset(p))}>
                    Reset password
                  </button>
                )}
                {p.role !== 'owner' && p.two_step && (
                  <button type="button" role="menuitem" onClick={() => (close(), turnOff(p))}>
                    Turn off two-step
                  </button>
                )}
                {p.role === 'owner' && <span className="menu-note">An owner's password can be reset once they are a viewer.</span>}
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
            {people ? acopy.count({ people: people.length, owners, viewers }) : '…'}
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

      {!people && <Loading height={120} />}
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
            void load()
            if (made.password) setIssued(made)
          }}
        />
      )}
      {issued && <OneTimePassword {...issued} onClose={() => setIssued(null)} />}
      {dialog}
    </section>
  )
}

/** Adding someone: their email and what they may do. The password to pass on
 *  follows in its own dialog (OneTimePassword). */
function AddPerson({ onClose, onAdded }: { onClose: () => void; onAdded: (made: { email: string; password: string }) => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const create = () => {
    setBusy(true)
    setErr(null)
    api
      .addPerson(email.trim(), role)
      .then((r) => {
        onAdded({ email: r.person.email, password: r.password })
      })
      .catch((e: unknown) => setErr(messageOf(e)))
      .finally(() => setBusy(false))
  }

  return (
    <Modal label="Add someone" className="person-modal" onClose={busy ? undefined : onClose}>
      <form
        className="person-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (email.includes('@')) create()
        }}
      >
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
    void navigator.clipboard?.writeText(text).then(() => {
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
    void load()
  }, [])

  // Two questions, because the password alone must not remove the phone: a
  // borrowed session or a password seen over a shoulder would be enough.
  const turnOff = async () => {
    const pw = await confirmWith({
      title: 'Turn off two-step sign-in?',
      body: 'Your account goes back to the password alone. Type it to confirm.',
      field: { label: 'Your password', type: 'password', autoComplete: 'current-password' },
      confirmLabel: 'Next',
      danger: true,
    })
    if (pw === null) return
    const code = await confirmWith({
      title: 'A code from your app',
      body: 'The six digits your authenticator shows now, or one of your recovery codes.',
      field: { label: 'Code', type: 'text', autoComplete: 'one-time-code' },
      confirmLabel: 'Turn off',
      danger: true,
      busyLabel: 'Turning off…',
      done: 'Two-step sign-in is off',
      // A wrong code or password is said in the dialog, which stays open for another go.
      run: (code) => api.disableTwoStep(pw, code),
    })
    if (code !== null) void load()
  }

  const on = state?.enabled === true
  const low = on && state.recovery_left <= 2
  let hint: ReactNode = 'Checking…'
  if (on)
    hint = (
      <>
        A code from your phone after the password ·{' '}
        <span className="num" style={low ? { color: 'var(--down)' } : undefined}>
          {state.recovery_left} of 8 recovery codes left
        </span>
        {low && ' — turn it off and on again for a fresh set'}
      </>
    )
  else if (state) hint = 'A password alone is one secret away from someone else’s hands'
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
