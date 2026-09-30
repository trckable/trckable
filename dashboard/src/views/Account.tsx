// The account dialog: everything that belongs to the person, not to the site
// they happen to be looking at. It opens over whatever is on screen, so the
// Settings page can stay about one site.
import { BellRing, Camera, Eye, EyeOff, ImageUp, LockKeyhole, LogOut, ShieldCheck, SunMoon, Trash2 } from 'lucide-react'
import { Modal } from '../components/Modal'
import { Window } from '../components/Window'
import { PersonAvatar } from '../components/PersonAvatar'
import { checksHere, setChecksHere } from '../lib/update'
import { Switch } from '../components/Switch'
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, messageOf, type Profile, type TwoStep as TwoStepState, type Site } from '../lib/api'
import { toast } from '../components/Toast'
import { closeAccount, openAccount, type AccountTab as Tab } from '../lib/account'
import { confirm, confirmWith } from '../components/Confirm'
import { DialogActions } from '../components/DialogActions'
import { THEMES, useTheme } from '../lib/theme'
import { isViewer } from '../lib/me'
import { usePictureVersion } from '../lib/profile'
import { SitesSettings } from './Sites'
import { InlineEdit } from '../components/InlineEdit'
import { signOut } from '../lib/signOut'
import { useWindowTabs } from './accountTabs'
import { copy as acopy } from './account/copy'
import { Line } from './AccountLine'
import { AccountHead } from './account/Head'
import './Account.css'
import { Keys } from './account/Keys'
import { People } from './account/People'

// The setup wizard carries the QR encoder, so it is fetched only when someone
// actually turns two-step sign-in on.
const TwoStepSetup = lazy(() => import('./TwoStepSetup'))
const AvatarCrop = lazy(() => import('../components/AvatarCrop'))

export function AccountDialog({ tab: asked, sites, email, onSites }: { tab: Tab; sites: Site[]; email?: string; onSites: () => void }) {
  const { tabs, tab } = useWindowTabs(asked)
  const viewer = isViewer()
  const [profile, setProfile] = useState<Profile | null>(null)
  const v = usePictureVersion() // one cache-buster for the header, this window and the people list
  useEffect(() => {
    api.profile().then(setProfile).catch(() => {})
  }, [])
  return (
    <Window label={acopy.accountLabel} head={<AccountHead profile={profile} email={email} v={v} />} tabs={tabs} tab={tab} onTab={(id) => openAccount(id as Tab)} onClose={closeAccount}>
      {/* A viewer sent to an owner's tab (Ask's "Create a key") lands on their own account. */}
      <div className="account-body">
        {tab === 'sites' && !viewer && <SitesSettings sites={sites} onSites={onSites} />}
        {tab === 'keys' && !viewer && <Keys />}
        {tab === 'people' && !viewer && <People me={email} />}
        {(tab === 'profile' || viewer) && <ProfileTab email={email} p={profile} v={v} onProfile={setProfile} />}
      </div>
    </Window>
  )
}

interface ProfileProps {
  email?: string
  p: Profile | null
  v: number
  onProfile: (p: Profile) => void
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

function ProfileTab({ email, p, v, onProfile }: ProfileProps) {
  const [updates, setUpdates] = useState(checksHere())
  const [pw, setPw] = useState(false)
  return (
    <>
      <Me email={email} p={p} v={v} onProfile={onProfile} />

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
function Me({ email, p, v, onProfile }: { email?: string; p: Profile | null; v: number; onProfile: (p: Profile) => void }) {
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
        <PersonAvatar p={p} email={email} v={v} size="huge" />
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
