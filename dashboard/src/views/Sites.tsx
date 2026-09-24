// Settings → Sites: everything about sites as a whole, not about one of them.
// Adding a site is a short wizard (domain → install → first visit), and each
// site can be renamed or removed from the same list.
import { Check } from 'lucide-react'
import { DialogActions } from '../components/DialogActions'
import { Modal } from '../components/Modal'
import { CURRENCIES, withCurrent, zones } from '../lib/site'
import { Picker } from '../components/Picker'
import { useEffect, useState } from 'react'
import { api, siteState, type Site, type Visit } from '../lib/api'
import { fmtInt } from '../lib/format'
import { navigate } from '../lib/url'
import { Ghost, Name } from '../components/Logo'
import { Menu } from '../components/Menu'
import { toast } from '../components/Toast'
import { Install } from './InstallPanel'
import { isViewer } from '../lib/me'

export function SitesSettings({ sites, onSites }: { sites: Site[]; onSites: () => void }) {
  const [wizard, setWizard] = useState(false)
  const [drop, setDrop] = useState<Site | null>(null)

  return (
    <section className="card" style={{ gap: 14 }}>
      <div className="card-head">
        <span className="faint" style={{ fontSize: 12 }}>
          {sites.length} {sites.length === 1 ? 'site' : 'sites'}
        </span>
        {!isViewer() && (
          <button type="button" className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => setWizard(true)}>
            + Add a site
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sites.map((s) => (
          <SiteRow key={s.id} site={s} onSites={onSites} onDelete={() => setDrop(s)} />
        ))}
        {sites.length === 0 && <p className="muted" style={{ margin: 0 }}>No sites yet.</p>}
      </div>

      {wizard && <AddWizard onClose={() => setWizard(false)} onSites={onSites} />}
      {drop && <DeleteSite site={drop} onClose={() => setDrop(null)} onSites={onSites} />}
    </section>
  )
}

function SiteRow({ site, onSites, onDelete }: { site: Site; onSites: () => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  // The same signal the site picker uses, so the two can never disagree.
  const state = siteState(site)
  const live = state === 'live'
  return (
    <div className="conn">
      <span className="dot" style={{ background: live ? 'var(--accent)' : 'var(--text-3)', borderRadius: '50%' }} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }} onDoubleClick={() => navigate('/' + encodeURIComponent(site.domain))}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong>{site.name || site.domain}</strong>
          {state === 'live' ? <span className="tag live">live</span> : state === 'quiet' ? <span className="tag quiet">no visits today</span> : <span className="tag quiet">not installed yet</span>}
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
          {site.name && site.name !== site.domain ? site.domain + ' · ' : ''}
          {site.timezone.replace(/_/g, ' ')} · {site.currency}
        </div>
      </div>
      <Menu label={`${site.domain} options`}>
        {(close) => (
          <>
            <button type="button" role="menuitem" onClick={() => (close(), navigate('/' + encodeURIComponent(site.domain)))}>
              Open dashboard
            </button>
            {!isViewer() && (
              <>
                <button type="button" role="menuitem" onClick={() => (close(), setEditing(true))}>
                  Edit site
                </button>
                <button type="button" role="menuitem" onClick={() => (close(), navigate('/settings?site=' + encodeURIComponent(site.id) + '&tab=install'))}>
                  Install snippet
                </button>
                <button type="button" role="menuitem" style={{ color: 'var(--down)' }} onClick={() => (close(), onDelete())}>
                  Delete site
                </button>
              </>
            )}
          </>
        )}
      </Menu>
      {editing && <EditSite site={site} onClose={() => setEditing(false)} onSaved={onSites} />}
    </div>
  )
}

/** Changing a site is the same three questions as adding one, in one place:
 *  the add wizard asked them, so editing should not scatter them across a
 *  settings page. */
function EditSite({ site, onClose, onSaved }: { site: Site; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(site.name)
  const [timezone, setTimezone] = useState(site.timezone)
  const [currency, setCurrency] = useState(site.currency)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const changed = name !== site.name || timezone !== site.timezone || currency !== site.currency

  const save = () => {
    setBusy(true)
    setErr(null)
    api
      .updateSite(site.id, { name: name.trim() || site.domain, timezone, currency })
      .then(() => {
        toast('Saved')
        onSaved()
        onClose()
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false))
  }

  return (
    <Modal label={`Edit ${site.domain}`} onClose={onClose}>
      <form className="modal-form" onSubmit={(e) => (e.preventDefault(), save())}>
        <div>
          <h2>{site.domain}</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            The domain never changes — it is what the snippet reports. Everything else is yours.
          </p>
        </div>

        <label className="field">
          Display name
          <input className="input" style={{ height: 44 }} value={name} placeholder={site.domain} autoFocus onChange={(e) => setName(e.target.value)} />
          <span className="faint" style={{ fontSize: 12 }}>
            What you call this site in trckable.
          </span>
        </label>

        <div className="edit-pair">
          <label className="field">
            Timezone
            <Picker
              label="Timezone"
              placeholder="Search a city or zone…"
              value={timezone}
              onPick={setTimezone}
              items={withCurrent(zones, timezone, (z) => z.replace(/_/g, ' '))}
            />
            <span className="faint" style={{ fontSize: 12 }}>
              Which day and hour a visit belongs to. Changing it reshapes past days.
            </span>
          </label>
          <label className="field">
            Currency
            <Picker label="Currency" placeholder="Search a currency…" value={currency} onPick={setCurrency} items={withCurrent(CURRENCIES, currency)} />
            <span className="faint" style={{ fontSize: 12 }}>
              Revenue is converted at the payment date, so past sales keep their value.
            </span>
          </label>
        </div>

        {err && (
          <span role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
            {err}
          </span>
        )}
        <div className="wiz-actions">
          <button type="button" className="btn ghost" onClick={() => navigate('/settings?site=' + encodeURIComponent(site.id))}>
            More settings →
          </button>
          <span className="spacer" style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !changed}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Deleting a site throws away everything recorded for it, so it asks for the
 * domain first and then shows the work: what is being cleared, and what was
 * removed when it is done. A long silence is the worst thing a delete can do.
 */
function DeleteSite({ site, onClose, onSites }: { site: Site; onClose: () => void; onSites: () => void }) {
  const [typed, setTyped] = useState('')
  const [step, setStep] = useState(0) // 0 asking · 1..3 working · 4 done
  const [gone, setGone] = useState<{ events: number; sessions: number; payments: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const STAGES = ['Clearing visits and sessions', 'Removing payments and settings', 'Tidying up']

  const run = () => {
    setErr(null)
    setStep(1)
    // The server does this in one pass; the stages move on their own so the
    // wait is legible, and the real counts land when it answers.
    const tick = setInterval(() => setStep((n) => (n < 3 ? n + 1 : n)), 700)
    api
      .deleteSite(site.id, typed.trim())
      .then((r) => {
        clearInterval(tick)
        setGone(r)
        setStep(4)
        onSites()
      })
      .catch((e: Error) => {
        clearInterval(tick)
        setErr(e.message)
        setStep(0)
      })
  }

  return (
    <Modal label={`Delete ${site.domain}`} onClose={step === 0 ? onClose : undefined}>
      {step === 0 && (
        <>
          <h2>Delete {site.domain}?</h2>
          <p className="muted" style={{ margin: 0 }}>
            Every visit, session and payment recorded for this site goes, here and in the analytics store. This cannot be undone.
          </p>
          <input
            className="input"
            style={{ height: 46 }}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={site.domain}
            aria-label="Type the domain to confirm"
            autoComplete="off"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && typed.trim().toLowerCase() === site.domain.toLowerCase() && run()}
          />
          {err && (
            <span role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
              {err}
            </span>
          )}
          <DialogActions
            left={
              <button type="button" className="btn ghost" onClick={onClose}>
                Keep it
              </button>
            }
          >
            <button type="button" className="btn danger big" disabled={typed.trim().toLowerCase() !== site.domain.toLowerCase()} onClick={run}>
              Delete site
            </button>
          </DialogActions>
        </>
      )}

      {step > 0 && step < 4 && (
        <>
          <h2>Deleting {site.domain}</h2>
          <ul className="stages">
            {STAGES.map((label, i) => (
              <li key={label} className={step > i + 1 ? 'done' : step === i + 1 ? 'now' : ''}>
                <span className="stage-mark" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
          <span className="faint" style={{ fontSize: 12 }}>
            A busy site can hold millions of rows — this can take a moment.
          </span>
        </>
      )}

      {step === 4 && (
        <>
          <div className="wiz-done">
            <Check size={34} strokeWidth={2} aria-hidden="true" />
            <b>{site.domain} is gone.</b>
          </div>
          {gone && (
            <ul className="bullets">
              <li>{fmtInt(gone.events)} events and {fmtInt(gone.sessions)} sessions removed</li>
              {gone.payments > 0 && <li>{fmtInt(gone.payments)} payments removed</li>}
              <li>Settings, modules and payment connections removed</li>
            </ul>
          )}
          <DialogActions>
            <button
              type="button"
              className="btn primary big"
              onClick={() => {
                onClose()
                navigate('/')
              }}
            >
              Done
            </button>
          </DialogActions>
        </>
      )}
    </Modal>
  )
}

/** Three steps: the domain, the snippet, and the first visit arriving. */
export function AddWizard({ onClose, onSites }: { onClose: () => void; onSites: () => void }) {
  const [step, setStep] = useState(1)
  const [domain, setDomain] = useState('')
  const [site, setSite] = useState<Site | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])

  // Step 3 watches for the first event instead of asking anyone to refresh.
  useEffect(() => {
    if (step !== 3 || !site) return
    const tick = () =>
      api
        .events(site.id, 1)
        .then((r) => {
          if (r.events.length) setVisits(r.events.map((e) => ({ kind: 'pageview', ts: Date.parse(e.ts), path: e.path }) as Visit))
        })
        .catch(() => {})
    tick()
    const t = setInterval(tick, 4000)
    return () => clearInterval(t)
  }, [step, site])

  const create = () => {
    setBusy(true)
    setErr(null)
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    api
      .createSite(domain.trim())
      .then((s) => api.updateSite(s.id, { timezone: zone }).catch(() => s))
      .then((s) => {
        setSite(s)
        onSites()
        setStep(2)
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false))
  }

  return (
    <Modal label="Add a site" className="wizard" onClose={onClose}>
      <div className="wiz-rail" aria-hidden="true">
        {['Domain', 'Install', 'First visit'].map((label, i) => (
          <span key={label} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
            <i />
            {label}
          </span>
        ))}
      </div>
      <div key={step} className="wiz-step">

      {step === 1 && (
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <h2>Which site?</h2>
          <input
            className="input"
            style={{ height: 50, fontSize: 15 }}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            aria-label="Domain"
            autoFocus
            required
          />
          <span className="faint" style={{ fontSize: 12 }}>
            Just the domain. Subdomains and www are counted together.
          </span>
          {err && (
            <span role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
              {err}
            </span>
          )}
          <button type="submit" className="btn primary big" disabled={busy || !domain.trim()}>
            {busy ? 'Adding…' : 'Add site'}
          </button>
        </form>
      )}

      {step === 2 && site && (
        <>
          <h2>
            Add <Name /> to {site.domain}
          </h2>
          <Install site={site} visits={[]} bare />
          <DialogActions
            left={
              <button type="button" className="btn ghost" onClick={() => (onClose(), navigate('/' + encodeURIComponent(site.domain)))}>
                I'll do it later
              </button>
            }
          >
            <button type="button" className="btn primary big" onClick={() => setStep(3)}>
              Added it — check
            </button>
          </DialogActions>
        </>
      )}

      {step === 3 && site && (
        <>
          <ListenScene arrived={visits.length > 0} />
          <h2 style={{ textAlign: 'center' }}>{visits.length ? 'Peekaboo! It works.' : 'Waiting for the first visit…'}</h2>
          <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
            {visits.length ? `We just recorded ${visits[0].path ?? '/'}.` : `Open ${site.domain} in a browser tab.`}
          </p>
          <DialogActions
            left={
              <button type="button" className="btn ghost" onClick={() => setStep(2)}>
                Back to the snippet
              </button>
            }
          >
            <button type="button" className={visits.length ? 'btn primary big' : 'btn big'} onClick={() => (onClose(), navigate('/' + encodeURIComponent(site.domain)))}>
              Open the dashboard
            </button>
          </DialogActions>
        </>
      )}
      </div>
    </Modal>
  )
}

/**
 * The last step is the one that matters: rings go out while trckable listens,
 * and the moment a visit lands the ghost pops up with a tick. Motion is the
 * feedback here, so it is worth the few lines.
 */
function ListenScene({ arrived }: { arrived: boolean }) {
  return (
    <div className={arrived ? 'listen arrived' : 'listen'} aria-hidden="true">
      <i className="ring" />
      <i className="ring" />
      <i className="ring" />
      <span className="listen-ghost">
        <Ghost size={54} peek={!arrived} />
      </span>
      {arrived && (
        <Check size={26} strokeWidth={2} aria-hidden="true" />
      )}
    </div>
  )
}
