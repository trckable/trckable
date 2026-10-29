// Settings → Sites: everything about sites as a whole, not about one of them.
// Adding a site is a short wizard (features/install: your site → install →
// revenue), and each
// site can be renamed or removed from the same list.
import { Plus, Settings2 } from 'lucide-react'
import { closeAccount } from '../lib/account'
import { SiteMark } from '../components/SiteMark'
import { Field } from '../components/Field'
import { Modal } from '../kit/Modal'
import { CURRENCIES, withCurrent, zones } from '../lib/site'
import { Picker } from '../components/Picker'
import { useState } from 'react'
import { siteState, stoppedWhy, fail, type Site, type SiteState, more } from '../lib/apiMore'
import { navigate } from '../lib/url'
import { Menu } from '../components/Menu'
import { toast } from '../components/Toast'
import { AddWizard } from '../features/install/AddWizard'
import { can } from '../lib/permissions'
import { openSettings } from '../lib/settings'
import './Sites.css'
import { DeleteSite } from './DeleteSite'

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
        {can('site.add') && (
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
        {can('site.add') && (
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

const PILL: Record<SiteState, string> = { live: 'Live', stopped: 'Down', quiet: 'Quiet', new: 'Not installed' }

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
        {state === 'new' && can('site.add') ? (
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
        {can('site.add') && (
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
            {can('site.add') && (
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
    more
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
    <Modal
      label={`Edit ${site.domain}`}
      onClose={onClose}
      frame={{
        title: site.domain,
        subtitle: 'The domain never changes.',
        help: 'It is what the snippet reports. Everything else is yours.',
        size: 'md',
        busy,
        onSubmit: save,
        extra: (
          <button type="button" className="btn ghost" onClick={() => openSettings(site)}>
            More settings →
          </button>
        ),
        actions: (
          <button type="submit" className="btn primary" disabled={busy || !changed}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        ),
      }}
    >
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
    </Modal>
  )
}
