import { Activity, Bell, Blocks, Check, ChevronLeft, ChevronRight, CircleCheck, Code, CreditCard, Info as InfoIcon, RefreshCw, Search, Settings as Cog, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { isViewer } from '../lib/me'
import { api, type InstallCheck, type Site } from '../lib/api'
import { navigate, useLocation } from '../lib/url'
import { Modal } from '../components/Modal'
import { SiteMark } from '../components/SiteMark'
import { Info } from '../components/Info'
import { toast } from '../components/Toast'
import { closeSettings, setSettingsTab, type SettingsTab } from '../lib/settings'
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
import './Settings.css'

type TabID = SettingsTab

const IconCrop = lazy(() => import('../components/AvatarCrop'))

// Only the open site lives here. Anything about the account — the list of
// sites, keys, the password — is one dialog away (see AccountDialog), so the
// two can never be mistaken for each other.
const TABS: { id: TabID; label: string; icon: typeof Cog }[] = [
  { id: 'site', label: 'General', icon: Cog },
  { id: 'install', label: 'Install', icon: Code },
  { id: 'modules', label: 'Modules', icon: Blocks },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'search', label: 'Search Console', icon: Search },
  { id: 'privacy', label: 'Data & privacy', icon: ShieldCheck },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'health', label: 'Health', icon: Activity },
]

function NavIcon({ d: Icon }: { d: typeof Cog }) {
  return <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
}

// Sections that exist for one module, and that module's id.
const MODULE_OF: Partial<Record<TabID, string>> = { search: 'search', payments: 'revenue' }
const MODULE_WHY: Partial<Record<TabID, { name: string; what: string }>> = {
  search: { name: 'Search Console', what: 'Turn it on to connect Google Search Console and see which searches showed your site, next to your own numbers.' },
  payments: { name: 'Revenue', what: 'Turn it on to connect Stripe, Lemon Squeezy, Polar, Paddle or Dodo and see which traffic pays.' },
}

/** A module's section while the module is off: what it would do, and the
 *  switch to turn it on — rather than a setup for something that is off. */
function ModuleOff({ site, tab, onOn }: { site: Site; tab: TabID; onOn: () => void }) {
  const [busy, setBusy] = useState(false)
  const why = MODULE_WHY[tab]!
  return (
    <section className="card module-off">
      <span className="icon-tile">
        <NavIcon d={TABS.find((t) => t.id === tab)!.icon} />
      </span>
      <div>
        <h3>The {why.name} module is off</h3>
        <p className="muted">{why.what}</p>
      </div>
      {!isViewer() && (
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            api
              .setModule(site.id, MODULE_OF[tab]!, true)
              .then(onOn)
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Turning on…' : 'Turn on'}
        </button>
      )}
    </section>
  )
}

// The dialog's menu, grouped the way an owner looks for things.
const GROUPS: { name: string; tabs: TabID[] }[] = [
  { name: 'This site', tabs: ['site', 'install', 'modules'] },
  { name: 'Money', tabs: ['payments'] },
  { name: 'Data', tabs: ['search', 'privacy', 'alerts'] },
  { name: 'Instance', tabs: ['health'] },
]

/** A site's settings as a dialog over its dashboard: the sections on the
 *  left, the section on the right. Opening it does not change the address
 *  (lib/settings.ts); closing it leaves the dashboard exactly as it was. */
export function SettingsDialog(p: { sites: Site[]; site: Site; tab: TabID; onSites: () => void }) {
  const tab = TABS.some((t) => t.id === p.tab) ? p.tab : 'site'
  const go = (id: TabID) => setSettingsTab(id)
  const close = closeSettings
  const current = TABS.find((t) => t.id === tab)!
  // Sections that belong to a module say so when it is off, and offer to
  // turn it on, instead of showing a setup that leads nowhere.
  const [mods, setMods] = useState<Record<string, boolean> | null>(null)
  const loadMods = () =>
    api
      .modules(p.site.id)
      .then((r) => setMods(Object.fromEntries(r.modules.map((m) => [m.id, m.enabled]))))
      .catch(() => setMods({}))
  useEffect(() => {
    loadMods()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.site.id, tab])
  const off = (id: TabID) => mods !== null && MODULE_OF[id] !== undefined && mods[MODULE_OF[id]!] === false
  // On a phone the sections are one row of tabs wider than the screen: the
  // edges fade and an arrow shows on the side that has more, and the open
  // one is scrolled into view.
  const nav = useRef<HTMLElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const measure = () => {
    const el = nav.current
    if (!el) return
    setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }
  useEffect(() => {
    nav.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [tab])
  const nudge = (dir: number) => nav.current?.scrollBy({ left: dir * 160, behavior: 'smooth' })
  return (
    <Modal label={`Settings for ${p.site.domain}`} className="settings-modal" onClose={close}>
      {more.left && (
        <button type="button" className="settings-scroll left" aria-label="Earlier sections" onClick={() => nudge(-1)}>
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      {more.right && (
        <button type="button" className="settings-scroll right" aria-label="More sections" onClick={() => nudge(1)}>
          <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      <nav ref={nav} onScroll={measure} className={'settings-nav' + (more.left ? ' more-left' : '') + (more.right ? ' more-right' : '')} aria-label="Settings sections">
        <div className="settings-title">
          <b>Settings</b>
          <span className="faint">{p.site.name || p.site.domain}</span>
        </div>
        {GROUPS.map((g) => (
          <div key={g.name} className="settings-group">
            <span className="settings-group-head">{g.name}</span>
            {g.tabs.map((id) => {
              const t = TABS.find((x) => x.id === id)!
              return (
                <button key={t.id} type="button" aria-current={tab === t.id} onClick={() => go(t.id)}>
                  <span className="icon-tile small">
                    <NavIcon d={t.icon} />
                  </span>
                  {t.label}
                  {off(t.id) && <span className="tag quiet nav-off">Off</span>}
                </button>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="settings-pane">
        <div className="settings-pane-head">
          <h2>{current.label}</h2>
          <button type="button" className="modal-close" aria-label="Close settings" onClick={close}>
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {/* Focusable, so the section scrolls from the keyboard too — even one,
            like Health, with nothing else in it to tab to. */}
        <div className="settings-body" key={tab} tabIndex={0} role="region" aria-label={current.label}>
          {off(tab) ? (
            <ModuleOff site={p.site} tab={tab} onOn={loadMods} />
          ) : (
            <SettingsSection tab={tab} site={p.site} onSites={p.onSites} />
          )}
        </div>
      </div>
    </Modal>
  )
}

function SettingsSection({ tab, site, onSites }: { tab: TabID; site: Site; onSites: () => void }) {
  return (
    <>
      {/* Saying it once is kinder than letting every save come back 403. */}
      {isViewer() && <p className="viewer-note">Your account reads this instance. Settings are shown as they are, and an owner changes them.</p>}
      {tab === 'site' && (
        <>
          <SiteSettings key={site.id} site={site} onSaved={onSites} />
          <SiteLook site={site} onSaved={onSites} />
        </>
      )}
      {tab === 'install' && <InstallSection site={site} />}
      {tab === 'modules' && <ModulesSettings key={'m' + site.id} site={site} />}
      {tab === 'payments' && <PaymentsSettings key={'pay' + site.id} site={site} onSiteChange={onSites} />}
      {tab === 'search' && <SearchSettings key={'sc' + site.id} site={site} />}
      {tab === 'privacy' && <PrivacySettings key={'pv' + site.id} site={site} onSites={onSites} />}
      {tab === 'alerts' && <AlertsSettings key={'al' + site.id} site={site} />}
      {tab === 'health' && <HealthSettings />}
    </>
  )
}

/** Install, once the site is installed: that it works comes first — when the
 *  last visit arrived, and on which page — with a button to look again; the
 *  code stays one click away, for a new page, a rebuild or a teammate.
 *  Before the first visit it is the install card as it always was. */
/** Once visits arrive, Install becomes a check you can run: this server reads
 *  the homepage and looks for the snippet, and the latest recorded visit says
 *  whether the script is sending. The code stays one click away. */
function InstallSection({ site }: { site: Site }) {
  const [last, setLast] = useState<{ ts: number; path?: string } | null | undefined>(undefined)
  const [page, setPage] = useState<InstallCheck | null>(null)
  // Which checks are still running. Each one resolves on its own, in order,
  // and never faster than the eye can follow: a check that answers in 20 ms
  // looked as if the button did nothing.
  const [pend, setPend] = useState({ page: true, visits: false })
  const [at, setAt] = useState<Date | null>(null)
  const [code, setCode] = useState(false)
  const checking = pend.page || pend.visits
  const latest = () =>
    api
      .events(site.id, 1)
      .then((r) => (r.events[0] ? { ts: Number(r.events[0].ts) || Date.parse(r.events[0].ts), path: r.events[0].path } : null))
      .catch(() => null)
  const check = async (visits: boolean) => {
    const t0 = Date.now()
    const wait = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms - (Date.now() - t0))))
    setPend({ page: true, visits })
    const pageP = api.checkInstall(site.id).catch((e: Error): InstallCheck => ({ url: `https://${site.domain}/`, error: e.message }))
    const lastP = visits ? latest() : null
    const [pg] = await Promise.all([pageP, wait(750)])
    setPage(pg)
    setPend((p) => ({ ...p, page: false }))
    if (lastP) {
      const [l] = await Promise.all([lastP, wait(1400)])
      if (l) setLast(l)
    }
    setPend({ page: false, visits: false })
    setAt(new Date())
  }
  useEffect(() => {
    // The latest visit decides what this tab is: the install steps, or the check.
    latest().then((l) => {
      setLast(l)
      if (l) check(false)
    })
  }, [site.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (last === undefined) return <div className="skeleton" style={{ height: 88 }} />
  if (last === null) return <Install site={site} visits={[]} inSettings />

  const DAY = 86_400_000
  const fresh = Date.now() - last.ts < 2 * DAY
  const where = page?.url.replace(/^https?:\/\//, '').replace(/\/$/, '') || site.domain
  const snippet: Step = !page || pend.page
    ? { tone: 'wait', title: 'Snippet on your homepage', text: `Reading ${site.domain}…` }
    : page.error
      ? { tone: 'warn', title: 'Snippet on your homepage', text: `Could not read it — ${page.error}.` }
      : page.found === 'site'
        ? { tone: 'ok', title: 'Snippet on your homepage', text: `Found on ${where}.` }
        : page.found === 'other'
          ? { tone: 'warn', title: 'A snippet for another site', text: `${where} loads trckable, but not with this site's id — copy the code below again.` }
          : {
              tone: fresh ? 'info' : 'warn',
              title: 'Not in the homepage',
              text: `No trckable script in ${where}'s HTML. That is fine when a tag manager or the npm package loads it — the visits below say whether it works.`,
            }
  const visits: Step = pend.visits
    ? { tone: 'wait', title: 'Visits arriving', text: 'Asking for the latest visit…' }
    : fresh
    ? { tone: 'ok', title: 'Visits arriving', text: `Last one ${agoText(last.ts)}${last.path ? ` on ${last.path}` : ''}.` }
    : { tone: 'warn', title: 'No recent visits', text: `The last one was ${agoText(last.ts)}${last.path ? ` on ${last.path}` : ''}. Is the snippet still on every page?` }
  const allOk = !checking && snippet.tone === 'ok' && visits.tone === 'ok'

  return (
    <>
      <section className="card install-check" aria-busy={checking}>
        <div className="install-check-head">
          <span className={'icon-tile' + (allOk ? ' accent' : '')} aria-hidden="true">
            {allOk ? <CircleCheck size={18} strokeWidth={1.75} /> : <Activity size={18} strokeWidth={1.75} />}
          </span>
          <div>
            <h3>{checking ? `Checking ${site.domain}…` : allOk ? `Installed on ${site.domain}` : visits.tone === 'ok' ? `Receiving visits from ${site.domain}` : `Check the install on ${site.domain}`}</h3>
            <p className="muted">This server reads your homepage like a browser would and looks for the snippet, then asks for the latest visit it recorded. Nothing is sent to your site.</p>
            {at && !checking && (
              <span className="install-at faint" key={at.getTime()}>
                Checked at {at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
          <button type="button" className="btn" onClick={() => check(true)} disabled={checking}>
            {checking ? <span className="btn-spin" aria-hidden="true" /> : <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />}
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
        <ul className="install-steps">
          {[snippet, visits].map((s) => (
            <li key={s.title} className={'install-step ' + s.tone}>
              <span className="install-step-mark" aria-hidden="true" key={s.tone}>
                {s.tone === 'ok' ? <Check size={14} strokeWidth={2.25} /> : s.tone === 'wait' ? <span className="btn-spin" /> : s.tone === 'info' ? <InfoIcon size={14} strokeWidth={2} /> : <TriangleAlert size={14} strokeWidth={2} />}
              </span>
              <span>
                <b>{s.title}</b>
                <span className="faint">{s.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="btn ghost install-more" aria-expanded={code} onClick={() => setCode((c) => !c)}>
        <ChevronRight size={15} strokeWidth={1.75} style={{ transform: code ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} aria-hidden="true" />
        {code ? 'Hide the code' : 'Show the code again'}
      </button>
      {code && <Install site={site} visits={[]} inSettings />}
    </>
  )
}

type Step = { tone: 'ok' | 'warn' | 'info' | 'wait'; title: string; text: string }

function agoText(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  return d === 1 ? 'a day ago' : `${d} days ago`
}

/** The page form, kept for an instance with no site yet: there is no
 *  dashboard to open a dialog over, only the list to add the first one. */
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
          {site && tab === 'privacy' && <PrivacySettings key={'pv' + site.id} site={site} onSites={p.onSites} />}
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

// A few colours that read well on both themes, and any other with the picker.
const SWATCHES = ['#b8ff3c', '#3ddc97', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb7185', '#fb923c', '#facc15']

/** How the site looks in trckable: its icon and its colour, in the site
 *  picker, All sites and the header. Nothing a visitor ever sees. */
function SiteLook({ site, onSaved }: { site: Site; onSaved: () => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [cropping, setCropping] = useState<File | null>(null)
  const [busy, setBusy] = useState<'favicon' | 'remove' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const act = (what: 'favicon' | 'remove', run: () => Promise<unknown>, said: string) => {
    setBusy(what)
    setErr(null)
    // At least a moment of "Looking…": a quick no used to look like nothing.
    const t0 = Date.now()
    const settled = (fn: () => void) => setTimeout(fn, Math.max(0, 600 - (Date.now() - t0)))
    run()
      .then(() => settled(() => (toast(said), onSaved(), setBusy(null))))
      .catch((e: Error) => settled(() => (setErr(e.message), setBusy(null))))
  }
  return (
    <section className="card" style={{ gap: 0 }}>
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>Look</h2>
        <Info text="How this site shows up inside trckable: the site picker, All sites and the header. Visitors never see it." />
      </div>
      <Row label="Icon" hint="Its favicon, or a picture you crop. PNG, JPEG, WebP, GIF or ICO.">
        <SiteMark site={site} size={36} />
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setCropping(f)
            e.target.value = ''
          }}
        />
        <button type="button" className="btn" disabled={!!busy} onClick={() => act('favicon', () => api.fetchSiteFavicon(site.id), 'Using the site\'s favicon')}>
          {busy === 'favicon' && <span className="btn-spin" aria-hidden="true" />}
          {busy === 'favicon' ? `Looking at ${site.domain}…` : 'Use its favicon'}
        </button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          Upload
        </button>
        {site.icon_url && (
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => act('remove', () => api.clearSiteIcon(site.id), 'Icon removed')}>
            Remove
          </button>
        )}
      </Row>
      {err && (
        <p className="look-err" role="alert">
          <TriangleAlert size={15} strokeWidth={1.75} aria-hidden="true" />
          {err}
        </p>
      )}
      <Row label="Colour" hint="The site's letter and marks, when it has no icon">
        <div className="swatches" role="radiogroup" aria-label="Colour">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={site.color === c}
              aria-label={c}
              className="swatch"
              style={{ background: c }}
              onClick={() => api.setSiteColor(site.id, c).then(onSaved).catch((e: Error) => toast(e.message, 'error'))}
            />
          ))}
          <label className="swatch custom" title="Another colour">
            <input type="color" value={site.color || '#b8ff3c'} onChange={(e) => api.setSiteColor(site.id, e.target.value).then(onSaved)} aria-label="Another colour" />
          </label>
          {site.color && (
            <button type="button" className="btn ghost small" onClick={() => api.setSiteColor(site.id, '').then(onSaved)}>
              None
            </button>
          )}
        </div>
      </Row>
      {cropping && (
        <Suspense fallback={null}>
          <IconCrop
            file={cropping}
            square
            title="The site's icon"
            onCancel={() => setCropping(null)}
            onSave={(picture) =>
              api.setSiteIcon(site.id, picture).then(() => {
                setCropping(null)
                toast('Icon saved')
                onSaved()
              })
            }
          />
        </Suspense>
      )}
    </section>
  )
}

/** A value you copy, hidden until asked for when it is a secret. */

export { Row }
