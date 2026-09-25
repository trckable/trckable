// Settings → Sites: everything about sites as a whole, not about one of them.
// Adding a site is a short wizard (domain → install → first visit), and each
// site can be renamed or removed from the same list.
import { Check, Globe, Plus, Settings2, TriangleAlert } from 'lucide-react'
import { HoldButton } from '../components/HoldButton'
import { closeAccount } from '../lib/account'
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

  const live = sites.filter((x) => siteState(x) === 'live').length
  const stopped = sites.filter((x) => siteState(x) === 'stopped').length
  return (
    <section className="sites-sec">
      <div className="sites-head">
        <span className="sites-head-text">
          <h2>Sites</h2>
          <span className="faint">
            {sites.length} {sites.length === 1 ? 'site' : 'sites'} · {live} receiving visits{stopped ? ` · ${stopped} stopped` : ''}
          </span>
        </span>
        {!isViewer() && (
          <button type="button" className="btn primary" onClick={() => setWizard(true)}>
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            Add a site
          </button>
        )}
      </div>

      <div className="sites-cards">
        {sites.map((s) => (
          <SiteRow key={s.id} site={s} onSites={onSites} onDelete={() => setDrop(s)} />
        ))}
        {!isViewer() && (
          <button type="button" className="site-add" onClick={() => setWizard(true)}>
            <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
            Add a site
          </button>
        )}
      </div>

      {wizard && <AddWizard onClose={() => setWizard(false)} onSites={onSites} />}
      {drop && <DeleteSite site={drop} onClose={() => setDrop(null)} onSites={onSites} />}
    </section>
  )
}

function lastVisit(unix: number): string {
  const s = Math.max(0, Date.now() / 1000 - unix)
  if (s < 3600) return 'within the hour'
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

function SiteRow({ site, onSites, onDelete }: { site: Site; onSites: () => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  // The same signal the site picker uses, so the two can never disagree.
  const state = siteState(site)
  const live = state === 'live'
  const go = () => (closeAccount(), navigate('/' + encodeURIComponent(site.domain)))
  return (
    <div className={'site-card ' + state}>
      <SiteMark site={site} size={38} />
      <div className="site-card-text">
        <span className="site-card-name">
          {site.name || site.domain}
          <span className={'site-pill ' + state} title={state === 'stopped' ? stoppedWhy(site) : undefined}>
            {live ? 'Live' : state === 'stopped' ? 'Stopped' : state === 'quiet' ? 'Quiet today' : 'Not installed'}
          </span>
        </span>
        <span className="faint">
          {site.name && site.name !== site.domain ? site.domain + ' · ' : ''}
          {site.timezone.replace(/_/g, ' ')} · {site.currency}
          {site.last_event_at ? ` · last visit ${lastVisit(site.last_event_at)}` : ''}
        </span>
      </div>
      <div className="site-card-actions">
        {state === 'new' && !isViewer() ? (
          <button type="button" className="btn" onClick={() => (closeAccount(), openSettings(site, 'install'))}>
            Install
          </button>
        ) : (
          <button type="button" className="btn" onClick={go}>
            Open
          </button>
        )}
        {!isViewer() && (
          <button type="button" className="btn icon ghost" aria-label={`${site.domain} settings`} title="Settings" onClick={() => (closeAccount(), openSettings(site))}>
            <Settings2 size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
      <Menu label={`${site.domain} options`}>
        {(close) => (
          <>
            <button type="button" role="menuitem" onClick={() => (close(), go())}>
              Open dashboard
            </button>
            {!isViewer() && (
              <>
                <button type="button" role="menuitem" onClick={() => (close(), setEditing(true))}>
                  Edit site
                </button>
                <button type="button" role="menuitem" onClick={() => (close(), closeAccount(), openSettings(site, 'install'))}>
                  {state === 'new' ? 'Install snippet' : 'Verify'}
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
  const [step, setStep] = useState<'what' | 'last' | 'working' | 'done'>('what')
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [gone, setGone] = useState<{ events: number; sessions: number; payments: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    api.deletePreview(site.id).then(setCounts).catch(() => setCounts({}))
  }, [site.id])
  const named = typed.trim().toLowerCase() === site.domain.toLowerCase()

  const run = () => {
    setErr(null)
    setStep('working')
    api
      .deleteSite(site.id, typed.trim())
      .then((r) => {
        // The summary first: refreshing the list now would take the page
        // (and this dialog) away before it is read.
        setGone(r)
        setStep('done')
      })
      .catch((e: Error) => {
        setErr(e.message)
        setStep('last')
      })
  }

  // What goes, in numbers, before anyone decides.
  const lines: [string, number | undefined][] = [
    ['events', counts?.events],
    ['visits', counts?.sessions],
    ['payments', counts?.payments],
    ['payment connections', counts?.connections],
    ['share links', counts?.shares],
    ['widgets', counts?.widgets],
  ]

  return (
    <Modal label={`Delete ${site.domain}`} className="danger-modal" keepSize={false} onClose={step === 'what' || step === 'last' ? onClose : undefined}>
      {step === 'what' && (
        <>
          <div className="danger-head">
            <span className="danger-mark" aria-hidden="true">
              <TriangleAlert size={22} strokeWidth={1.9} />
            </span>
            <div>
              <h2>Delete {site.domain}?</h2>
              <span>This removes the site and everything recorded for it. There is no undo.</span>
            </div>
          </div>
          <div className="danger-list">
            <b>What goes</b>
            <ul>
              {lines.map(([label, n]) => (
                <li key={label}>
                  <span className="num">{n === undefined ? '…' : fmtInt(n)}</span> {label}
                </li>
              ))}
              <li>Its settings, modules, verification and look</li>
            </ul>
            <span className="faint">Backups made before now still hold it until they age out. Payment providers keep the webhooks they were given; remove those there.</span>
          </div>
          <label className="field danger-type">
            <span>
              Type <b>{site.domain}</b> to continue
            </span>
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={site.domain}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && named && setStep('last')}
            />
          </label>
          <DialogActions
            left={
              <button type="button" className="btn ghost" onClick={onClose} autoFocus={false}>
                Keep it
              </button>
            }
          >
            <button type="button" className="btn danger big" disabled={!named} onClick={() => setStep('last')}>
              Continue
            </button>
          </DialogActions>
        </>
      )}

      {step === 'last' && (
        <>
          <div className="danger-head">
            <span className="danger-mark" aria-hidden="true">
              <TriangleAlert size={22} strokeWidth={1.9} />
            </span>
            <div>
              <h2>Last check</h2>
              <span>Once you hold the button, {site.domain} is deleted for good. Nobody, including trckable, can bring it back from here.</span>
            </div>
          </div>
          <div className="danger-list danger-final">
            <span>
              <b className="num">{fmtInt(counts?.events ?? 0)}</b> events
            </span>
            <span>
              <b className="num">{fmtInt(counts?.sessions ?? 0)}</b> visits
            </span>
            <span>
              <b className="num">{fmtInt(counts?.payments ?? 0)}</b> payments
            </span>
          </div>
          {err && (
            <p className="confirm-err" role="alert">
              {err}
            </p>
          )}
          <DialogActions
            left={
              <button type="button" className="btn ghost" onClick={() => setStep('what')}>
                Back
              </button>
            }
          >
            <HoldButton onDone={run}>Hold to delete forever</HoldButton>
          </DialogActions>
        </>
      )}

      {step === 'working' && (
        <div className="danger-working">
          <span className="btn-spin" aria-hidden="true" />
          <b>Deleting {site.domain}…</b>
          <span className="faint">A busy site can hold millions of rows: this can take a moment. Keep this open.</span>
        </div>
      )}

      {step === 'done' && (
        <>
          <div className="wiz-done">
            <Check size={34} strokeWidth={2} aria-hidden="true" />
            <b>{site.domain} is gone.</b>
          </div>
          {gone && (
            <ul className="bullets">
              <li>
                {fmtInt(gone.events)} events and {fmtInt(gone.sessions)} visits removed
              </li>
              {gone.payments > 0 && <li>{fmtInt(gone.payments)} payments removed</li>}
              <li>Settings, modules, share links and widgets removed</li>
            </ul>
          )}
          <DialogActions>
            <button
              type="button"
              className="btn primary big"
              onClick={() => {
                onClose()
                onSites()
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
