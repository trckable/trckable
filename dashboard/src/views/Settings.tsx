import { useState } from 'react'
import { isViewer } from '../lib/me'
import { api, type Site } from '../lib/api'
import { navigate, useLocation } from '../lib/url'
import { Picker } from '../components/Picker'
import { Row } from '../components/Row'
import { Copyable } from '../components/Copyable'
import { Install } from './InstallPanel'
import { ModulesSettings } from './Modules'
import { PaymentsSettings } from './Payments'
import { PrivacySettings } from './Privacy'
import { HealthSettings } from './Health'
import { AlertsSettings } from './Alerts'
import { SearchSettings } from './Search'
import { SitesSettings } from './Sites'
import { CURRENCIES, withCurrent, zones } from '../lib/site'

type TabID = 'site' | 'install' | 'modules' | 'payments' | 'search' | 'privacy' | 'alerts' | 'health'

// Only the open site lives here. Anything about the account — the list of
// sites, keys, the password — is one dialog away (see AccountDialog), so the
// two can never be mistaken for each other.
const TABS: { id: TabID; label: string; icon: string }[] = [
  { id: 'site', label: 'General', icon: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z' },
  { id: 'install', label: 'Install', icon: 'm9 8-5 4 5 4m6-8 5 4-5 4' },
  { id: 'modules', label: 'Modules', icon: 'M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z' },
  { id: 'payments', label: 'Payments', icon: 'M3 8h18M3 12.5h18M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z' },
  { id: 'search', label: 'Search Console', icon: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4.35-4.35' },
  { id: 'privacy', label: 'Data & privacy', icon: 'M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3Zm0 7v4' },
  { id: 'alerts', label: 'Alerts', icon: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0' },
  { id: 'health', label: 'Health', icon: 'M3 12h4l2.5-6 4 12 2.5-6H21' },
]

function NavIcon({ d }: { d: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function Settings(p: { sites: Site[]; site: Site | null; onSites: () => void; header: React.ReactNode }) {
  const site = p.site ?? p.sites[0] ?? null
  const { params } = useLocation()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'site') as TabID
  const go = (id: TabID) => navigate(`/settings?site=${encodeURIComponent(site?.id ?? '')}&tab=${id}`)

  return (
    <>
      <div className="header">
        {p.header}
        <h1 style={{ fontSize: 18 }}>Settings</h1>
        <div className="spacer" />
        {site && (
          <button type="button" className="btn back" onClick={() => navigate('/' + encodeURIComponent(site.domain))} title="Back to dashboard" aria-label="Back to dashboard">
            <span aria-hidden="true">←</span>
            <span className="label">Back to dashboard</span>
          </button>
        )}
      </div>

      <div className="settings">
        <nav className="settings-nav" aria-label="Settings sections">
          <span className="nav-group">{site ? site.domain : 'This site'}</span>
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-current={tab === t.id} onClick={() => go(t.id)} disabled={!site}>
              <NavIcon d={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="settings-body">
          {/* Saying it once is kinder than letting every save come back 403. */}
          {isViewer() && (
            <p className="viewer-note">
              Your account reads this instance. Settings are shown as they are, and an owner changes them.
            </p>
          )}
          {!site && <SitesSettings sites={p.sites} onSites={p.onSites} />}
          {site && tab === 'site' && (
            <>
              <SiteSettings key={site.id} site={site} onSaved={p.onSites} />
            </>
          )}
          {site && tab === 'install' && <Install site={site} visits={[]} inSettings />}
          {site && tab === 'modules' && <ModulesSettings key={'m' + site.id} site={site} />}
          {site && tab === 'payments' && <PaymentsSettings key={'pay' + site.id} site={site} onSiteChange={p.onSites} />}
          {site && tab === 'search' && <SearchSettings key={'sc' + site.id} site={site} />}
          {site && tab === 'privacy' && <PrivacySettings key={'pv' + site.id} site={site} />}
          {site && tab === 'alerts' && <AlertsSettings key={'al' + site.id} site={site} />}
          {tab === 'health' && <HealthSettings />}
        </div>
      </div>
    </>
  )
}

/** "Saved" that fades away, so a save needs no button and no banner. */
function useSaved() {
  const [saved, setSaved] = useState(false)
  return [saved, () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }] as const
}

function SiteSettings({ site, onSaved }: { site: Site; onSaved: () => void }) {
  const [name, setName] = useState(site.name)
  const [saved, flash] = useSaved()
  const [err, setErr] = useState<string | null>(null)
  const save = (patch: { name?: string; timezone?: string; currency?: string }) =>
    api
      .updateSite(site.id, { name, ...patch })
      .then(() => {
        flash()
        onSaved()
      })
      .catch((e: Error) => setErr(e.message))

  return (
    <section className="card" style={{ gap: 0 }}>
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>{site.domain}</h2>
        <span className={saved ? 'saved on' : 'saved'} aria-live="polite">
          Saved
        </span>
      </div>

      <Row label="Display name" hint="What you call this site in trckable">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== site.name && save({ name })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder={site.domain}
        />
      </Row>

      <Row label="Timezone" hint="Which day and hour a visit belongs to">
        <Picker
          label="Timezone"
          align="right"
          placeholder="Search a city or zone…"
          value={site.timezone}
          onPick={(timezone) => save({ timezone })}
          items={withCurrent(zones, site.timezone, (z) => z.replace(/_/g, ' '))}
        />
      </Row>

      <Row label="Currency" hint="Revenue is converted at the payment date">
        <Picker
          label="Currency"
          align="right"
          placeholder="Search a currency…"
          value={site.currency}
          onPick={(currency) => save({ currency })}
          items={withCurrent(CURRENCIES, site.currency)}
        />
      </Row>

      <Row label="Site id" hint="Used by the snippet and the API">
        <Copyable value={site.id} />
      </Row>

      {/* A credential, so the server sends it to owners only. */}
      {site.proxy_key ? (
        <Row label="Proxy key" hint="Lets your own server forward a visitor's location" tone="danger">
          <Copyable value={site.proxy_key} secret />
        </Row>
      ) : (
        <Row label="Proxy key" hint="Lets your own server forward a visitor's location">
          <span className="faint">Owners only</span>
        </Row>
      )}

      {err && (
        <span role="alert" style={{ color: 'var(--down)', fontSize: 13, paddingTop: 10 }}>
          {err}
        </span>
      )}
    </section>
  )
}

/** A value you copy, hidden until asked for when it is a secret. */

export { Row }
