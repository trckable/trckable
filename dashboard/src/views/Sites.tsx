// Settings → Sites: everything about sites as a whole, not about one of them.
// Adding a site is a short wizard (domain → install → first visit), and each
// site can be renamed or removed from the same list.
import { Check, Globe } from 'lucide-react'
import { SiteMark } from '../components/SiteMark'
import { StepBody } from '../components/StepBody'
import { Steps } from '../components/Steps'
import { DialogActions } from '../components/DialogActions'
import { Modal } from '../components/Modal'
import { CURRENCIES, withCurrent, zones } from '../lib/site'
import { Picker } from '../components/Picker'
import { useEffect, useState } from 'react'
import { api, siteState, stoppedWhy, type InstallCheck, type Site, type Visit } from '../lib/api'
import { fmtInt } from '../lib/format'
import { navigate } from '../lib/url'
import { Ghost, Name } from '../components/Logo'
import { Menu } from '../components/Menu'
import { toast } from '../components/Toast'
import { Install } from './InstallPanel'
import { isViewer } from '../lib/me'
import { openSettings } from '../lib/settings'
import './Sites.css'

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
      <span className="dot" style={{ background: live ? 'var(--accent)' : state === 'stopped' ? 'var(--down)' : 'var(--text-3)', borderRadius: '50%' }} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }} onDoubleClick={() => navigate('/' + encodeURIComponent(site.domain))}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong>{site.name || site.domain}</strong>
          {state === 'live' ? (
            <span className="tag live">live</span>
          ) : state === 'stopped' ? (
            <span className="tag danger" title={stoppedWhy(site)}>
              stopped
            </span>
          ) : state === 'quiet' ? (
            <span className="tag quiet">no visits today</span>
          ) : (
            <span className="tag quiet">not installed yet</span>
          )}
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
                <button type="button" role="menuitem" onClick={() => (close(), openSettings(site, 'install'))}>
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
          <button type="button" className="btn ghost" onClick={() => openSettings(site)}>
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
export function DeleteSite({ site, onClose, onSites }: { site: Site; onClose: () => void; onSites: () => void }) {
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
  const [page, setPage] = useState<InstallCheck | 'checking' | null>(null)

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

  // …and looks at the homepage once, the way Verify does, so a snippet that
  // is in place but not yet visited is said to be in place.
  const lookAtPage = () => {
    if (!site) return
    setPage('checking')
    api
      .checkInstall(site.id)
      .then(setPage)
      .catch(() => setPage(null))
  }
  useEffect(() => {
    if (step === 3) lookAtPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

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

  const clean = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const sub = step === 1 ? 'The domain you want to count visits on.' : step === 2 ? `One line in the <head> of ${site?.domain}, and every page is counted.` : 'Open your site in a browser tab: the visit shows up here.'
  const open = () => site && (onClose(), navigate('/' + encodeURIComponent(site.domain)))

  return (
    <Modal label="Add a site" className="wizard" onClose={onClose}>
      <div className="wiz-head">
        <span className="modal-badge" aria-hidden="true">
          <Globe size={19} strokeWidth={1.75} />
        </span>
        <div>
          <h2>{step === 1 ? 'Add a site' : step === 2 ? <>Add <Name /> to {site?.domain}</> : visits.length ? 'Peekaboo! It works.' : 'Waiting for the first visit…'}</h2>
          <span className="faint">{sub}</span>
        </div>
      </div>
      <Steps labels={['Your site', 'The snippet', 'First visit']} at={step - 1} done={visits.length > 0 ? 2 : undefined} />

      <StepBody step={step} className="wiz-step">
        {step === 1 && (
          <form
            id="wiz-domain"
            className="wiz-domain"
            onSubmit={(e) => {
              e.preventDefault()
              create()
            }}
          >
            <label className="wiz-field">
              <span className="wiz-prefix" aria-hidden="true">
                https://
              </span>
              <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" aria-label="Domain" autoFocus required spellCheck={false} autoCapitalize="none" />
              {clean && <SiteMark site={{ domain: clean } as Site} size={28} />}
            </label>
            <span className="faint wiz-help">Just the domain. www and every subdomain are counted with it.</span>
            {err && (
              <p className="confirm-err" role="alert">
                {err}
              </p>
            )}
          </form>
        )}

        {step === 2 && site && <Install site={site} visits={[]} bare />}

        {step === 3 && site && (
          <div className="wiz-wait">
            <ListenScene arrived={visits.length > 0} />
            <p className="muted">{visits.length ? `We just recorded ${visits[0].path ?? '/'} on ${site.domain}.` : `Open ${site.domain} in a browser tab. This page updates by itself.`}</p>
            <div className={'wiz-found' + (page && page !== 'checking' ? (page.found === 'site' ? ' ok' : ' warn') : '')}>
              {page === 'checking' ? (
                <>
                  <span className="btn-spin" aria-hidden="true" /> Looking for the snippet on {site.domain}…
                </>
              ) : page?.found === 'site' ? (
                <>
                  <Check size={15} strokeWidth={2.25} aria-hidden="true" /> The snippet is on {site.domain}
                </>
              ) : page ? (
                <>
                  {page.error ? `${site.domain} did not answer` : `No snippet on ${site.domain}'s homepage yet`}
                  <button type="button" className="linkish" onClick={lookAtPage}>
                    Look again
                  </button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </StepBody>

      <DialogActions
        left={
          step === 1 ? (
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
          ) : step === 2 ? (
            <button type="button" className="btn ghost" onClick={open}>
              I'll do it later
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setStep(2)}>
              Back to the snippet
            </button>
          )
        }
      >
        {step === 1 && (
          <button type="submit" form="wiz-domain" className="btn primary big" disabled={busy || !clean}>
            {busy && <span className="btn-spin" aria-hidden="true" />}
            {busy ? 'Adding…' : 'Continue'}
          </button>
        )}
        {step === 2 && (
          <button type="button" className="btn primary big" onClick={() => setStep(3)}>
            I added it — check
          </button>
        )}
        {step === 3 && (
          <button type="button" className={visits.length ? 'btn primary big' : 'btn big'} onClick={open}>
            Open the dashboard
          </button>
        )}
      </DialogActions>
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
