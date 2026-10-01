// Settings → Sites: everything about sites as a whole, not about one of them.
// Adding a site is a short wizard (features/install: your site → install →
// revenue), and each
// site can be renamed or removed from the same list.
import { Check, Plus, Settings2, TriangleAlert } from 'lucide-react'
import { HoldButton } from '../components/HoldButton'
import { closeAccount } from '../lib/account'
import { SiteMark } from '../components/SiteMark'
import { DialogActions } from '../components/DialogActions'
import { DialogHead } from '../components/DialogHead'
import { Field } from '../components/Field'
import { Info } from '../components/Info'
import { Modal } from '../components/Modal'
import { CURRENCIES, withCurrent, zones } from '../lib/site'
import { Picker } from '../components/Picker'
import { useEffect, useState } from 'react'
import { api, siteState, stoppedWhy, fail, type Site, type SiteState } from '../lib/api'
import { fmtInt } from '../lib/format'
import { navigate } from '../lib/url'
import { Menu } from '../components/Menu'
import { toast } from '../components/Toast'
import { AddWizard } from '../features/install/AddWizard'
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

const PILL: Record<SiteState, string> = { live: 'Live', stopped: 'Stopped', quiet: 'Quiet today', new: 'Not installed' }

function SiteRow({ site, onSites, onDelete }: { site: Site; onSites: () => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  // The same signal the site picker uses, so the two can never disagree.
  const state = siteState(site)
  const go = () => {
    closeAccount()
    navigate('/' + encodeURIComponent(site.domain))
  }
  return (
    <div className={'site-card ' + state}>
      <SiteMark site={site} size={38} />
      <div className="site-card-text">
        <span className="site-card-name">
          {site.name || site.domain}
          <span className={'site-pill ' + state} title={state === 'stopped' ? stoppedWhy(site) : undefined}>
            {PILL[state]}
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
          <button type="button" className="btn" onClick={() => {
              closeAccount()
              openSettings(site, 'install')
            }}>
            Install
          </button>
        ) : (
          <button type="button" className="btn" onClick={go}>
            Open
          </button>
        )}
        {!isViewer() && (
          <button type="button" className="btn icon ghost" aria-label={`${site.domain} settings`} title="Settings" onClick={() => {
            closeAccount()
            openSettings(site)
          }}>
            <Settings2 size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
      <Menu label={`${site.domain} options`}>
        {(close) => (
          <>
            <button type="button" role="menuitem" onClick={() => {
              close()
              go()
            }}>
              Open dashboard
            </button>
            {!isViewer() && (
              <>
                <button type="button" role="menuitem" onClick={() => {
                  close()
                  setEditing(true)
                }}>
                  Edit site
                </button>
                <button type="button" role="menuitem" onClick={() => {
                  close()
                  closeAccount()
                  openSettings(site, 'install')
                }}>
                  {state === 'new' ? 'Install snippet' : 'Verify'}
                </button>
                <button type="button" role="menuitem" style={{ color: 'var(--down)' }} onClick={() => {
                  close()
                  onDelete()
                }}>
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
  const changed = name !== site.name || timezone !== site.timezone || currency !== site.currency

  const save = () => {
    setBusy(true)
    api
      .updateSite(site.id, { name: name.trim() || site.domain, timezone, currency })
      .then(() => {
        toast('Saved')
        onSaved()
        onClose()
      })
      .catch((e: unknown) => fail(e, save))
      .finally(() => setBusy(false))
  }

  return (
    <Modal label={`Edit ${site.domain}`} onClose={onClose}>
      <form className="modal-form" onSubmit={(e) => {
        e.preventDefault()
        save()
      }}>
        <DialogHead heading={site.domain} hint="The domain never changes." help="It is what the snippet reports. Everything else is yours." />

        <Field label="Display name">
          {(f) => <input {...f} className="input" value={name} placeholder={site.domain} autoFocus onChange={(e) => setName(e.target.value)} />}
        </Field>

        <div className="edit-pair">
          <Field label="Timezone" plain help="Which day and hour a visit belongs to. Changing it reshapes past days.">
            {() => <Picker label="Timezone" placeholder="Search a city or zone…" value={timezone} onPick={setTimezone} items={withCurrent(zones, timezone, (z) => z.replace(/_/g, ' '))} />}
          </Field>
          <Field label="Currency" plain help="Revenue is converted at the payment date, so past sales keep their value.">
            {() => <Picker label="Currency" placeholder="Search a currency…" value={currency} onPick={setCurrency} items={withCurrent(CURRENCIES, currency)} />}
          </Field>
        </div>

        <DialogActions
          left={
            <>
              <button type="button" className="btn ghost" onClick={() => openSettings(site)}>
                More settings →
              </button>
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
            </>
          }
        >
          <button type="submit" className="btn primary" disabled={busy || !changed}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </DialogActions>
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
  useEffect(() => {
    api.deletePreview(site.id).then(setCounts).catch(() => setCounts({}))
  }, [site.id])
  const named = typed.trim().toLowerCase() === site.domain.toLowerCase()

  const run = () => {
    setStep('working')
    // At least a moment on screen: a small site goes in milliseconds, and a
    // flash of the working step read as a glitch.
    const shown = new Promise((r) => setTimeout(r, 1200))
    api
      .deleteSite(site.id, typed.trim())
      .then(async (r) => {
        await shown
        // The summary first: refreshing the list now would take the page
        // (and this dialog) away before it is read.
        setGone(r)
        setStep('done')
      })
      .catch((e: unknown) => {
        fail(e, run)
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
          <div className="danger-step" key="what">
            <DialogHead icon={TriangleAlert} danger heading={`Delete ${site.domain}?`} hint="Removes the site and all its data. There is no undo." />
          </div>
          <div className="danger-list danger-step">
            <b className="danger-what">
              What goes
              <Info text="Backups made before now still hold it until they age out. Payment providers keep the webhooks they were given; remove those there." />
            </b>
            <ul>
              {lines.map(([label, n]) => (
                <li key={label}>
                  <span className="num">{n === undefined ? '…' : fmtInt(n)}</span> {label}
                </li>
              ))}
              <li>Its settings, modules, verification and look</li>
            </ul>
          </div>
          <div className="danger-type">
            <Field label={`Type ${site.domain} to continue`}>
              {(f) => (
                <input
                  {...f}
                  className="input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={site.domain}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && named && setStep('last')}
                />
              )}
            </Field>
          </div>
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
          <div className="danger-step" key="last">
            <DialogHead icon={TriangleAlert} danger heading="Last check" hint={`Hold the button and ${site.domain} is gone for good.`} help="Nobody, including trckable, can bring it back from here." />
          </div>
          <div className="danger-list danger-final danger-step">
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
        <div className="danger-working danger-step" key="working" role="status" aria-live="polite">
          <div className="shred" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <b>Deleting {site.domain}…</b>
          <span className="shred-bar" aria-hidden="true">
            <span />
          </span>
          <span className="faint">This can take a moment. Keep this open.</span>
        </div>
      )}

      {step === 'done' && (
        <>
          <div className="wiz-done danger-done danger-step" key="done">
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
