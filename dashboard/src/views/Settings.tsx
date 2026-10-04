import { Activity, Bell, Blocks, Check, ChevronRight, CircleCheck, Code, CreditCard, Info as InfoIcon, LayoutTemplate, RefreshCw, Search, Settings as Cog, Share2, ShieldCheck, StickyNote, TriangleAlert } from 'lucide-react'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { isViewer } from '../lib/me'
import { api, siteState, fail, type InstallCheck, type Site, type SiteState, more } from '../lib/apiMore'
import { words } from '../lib/errors'
import { Window, type WindowTab } from '../components/Window'
import { SettingsHead } from './SettingsHead'
import { SiteMark } from '../components/SiteMark'
import { Info } from '../components/Info'
import { toast } from '../components/Toast'
import { closeSettings, setSettingsTab, type SettingsTab } from '../lib/settings'
import { Picker } from '../components/Picker'
import { InlineEdit } from '../components/InlineEdit'
import { Row } from '../components/Row'
import { Copyable } from '../components/Copyable'
import { Install } from '../features/install/Install'
import { ModulesSettings } from './Modules'
import { PaymentsSettings } from './Payments'
import { PrivacyTab, ReportSettings } from '../features/privacy/PrivacyTab'
import { Locked } from '../components/Locked'
import { Shares } from './Shares'
import { WidgetsSettings } from './Widgets'
import { HealthSettings } from './Health'
import { AlertsTab } from '../features/reports/AlertsTab'
import { SearchSettings } from './Search'
import { MODULE_WHY, moduleOf } from './settingsModules'
import { NotesSettings } from '../features/notes/NotesSettings'
import { MilestonesSetting } from '../features/milestones/MilestonesSetting'
import { ImportSetting } from '../features/install/ImportSetting'
import { DeleteSite } from './Sites'
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
  { id: 'sharing', label: 'Sharing', icon: Share2 },
  { id: 'widgets', label: 'Widgets', icon: LayoutTemplate },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'search', label: 'Search Console', icon: Search },
  { id: 'privacy', label: 'Data & privacy', icon: ShieldCheck },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'health', label: 'Health', icon: Activity },
]

function NavIcon({ d: Icon }: { d: typeof Cog }) {
  return <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
}

/** A module's section while the module is off: what it would do, and the
 *  switch to turn it on — rather than a setup for something that is off. */
function ModuleOff({ site, tab, onOn }: { site: Site; tab: TabID; onOn: () => void }) {
  const [busy, setBusy] = useState(false)
  const why = MODULE_WHY[tab]
  const id = moduleOf(tab)
  const icon = TABS.find((t) => t.id === tab)?.icon
  if (!why || !id || !icon) return null
  return (
    <section className="card module-off">
      <span className="icon-tile">
        <NavIcon d={icon} />
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
            more
              .setModule(site.id, id, true)
              .then(onOn)
              .catch((e: unknown) => fail(e))
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
  { name: 'This site', tabs: ['site', 'install', 'modules', 'sharing', 'widgets', 'notes'] },
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
  // Once visits arrive there is nothing left to install, only to verify.
  const label = (t: (typeof TABS)[number]) => (t.id === 'install' && p.site.last_event_at ? 'Verify' : t.label)
  // Sections that belong to a module say so when it is off, and offer to
  // turn it on, instead of showing a setup that leads nowhere.
  const [mods, setMods] = useState<Partial<Record<string, boolean>> | null>(null)
  const loadMods = () =>
    api
      .modules(p.site.id)
      .then((r) => setMods(Object.fromEntries(r.modules.map((m) => [m.id, m.enabled]))))
      .catch(() => setMods({}))
  useEffect(() => {
    void loadMods()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMods is a new function every render; refetch only when the site or the open section changes
  }, [p.site.id, tab])
  const off = (id: TabID) => {
    const m = moduleOf(id)
    return mods !== null && m !== undefined && mods[m] === false
  }
  const tabs: WindowTab[] = GROUPS.flatMap((g) =>
    g.tabs.flatMap((id) => {
      const t = TABS.find((x) => x.id === id)
      return t ? [{ id: t.id, label: label(t), icon: t.icon, group: g.name, flag: off(t.id) ? <span className="tag quiet">Off</span> : undefined }] : []
    }),
  )
  return (
    <Window label={`Settings for ${p.site.domain}`} head={<SettingsHead site={p.site} />} tabs={tabs} tab={tab} onTab={(id) => go(id as TabID)} onClose={close}>
      {off(tab) ? <ModuleOff site={p.site} tab={tab} onOn={loadMods} /> : <SettingsSection tab={tab} site={p.site} onSites={p.onSites} />}
    </Window>
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
          <Locked><SiteLook site={site} onSaved={onSites} /><ReportSettings key={'r' + site.id} site={site} onSites={onSites} /></Locked>
          {!isViewer() && <DangerZone site={site} onSites={onSites} />}
        </>
      )}
      {tab === 'sharing' && <Shares key={'sh' + site.id} site={site} />}
      {/* Widgets go on your own pages, so they are their own section, not a kind of share. */}
      {tab === 'widgets' && <Locked><WidgetsSettings key={'wg' + site.id} site={site} /></Locked>}
      {tab === 'install' && <><InstallSection site={site} /><ImportSetting key={'im' + site.id} site={site} /></>}
      {tab === 'notes' && <><NotesSettings key={'n' + site.id} site={site} /><MilestonesSetting key={'ms' + site.id} site={site} /></>}
      {tab === 'modules' && <ModulesSettings key={'m' + site.id} site={site} />}
      {tab === 'payments' && <PaymentsSettings key={'pay' + site.id} site={site} onSiteChange={onSites} />}
      {tab === 'search' && <SearchSettings key={'sc' + site.id} site={site} />}
      {tab === 'privacy' && <Locked><PrivacyTab key={'pv' + site.id} site={site} onSites={onSites} /></Locked>}
      {tab === 'alerts' && <Locked><AlertsTab key={'al' + site.id} site={site} /></Locked>}
      {tab === 'health' && <HealthSettings />}
    </>
  )
}

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
  const [code, setCode] = useState<boolean | null>(null) // null: open when not verified
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
    const pageP = more.checkInstall(site.id).catch((e: unknown): InstallCheck => ({ url: `https://${site.domain}/`, scripts: 0, error: words(e) }))
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
    void latest().then((l) => {
      setLast(l)
      if (l) void check(false)
    })
  }, [site.id]) // eslint-disable-line react-hooks/exhaustive-deps -- latest and check are new functions every render; this runs once per site
  if (last === undefined) return <div className="skeleton" style={{ height: 88 }} />
  if (last === null) return <Install site={site} visits={[]} variant="settings" />

  const fresh = withinDay(last.ts)
  const seen = `${agoText(last.ts)}${last.path ? ` on ${last.path}` : ''}`
  const where = page?.url.replace(/^https?:\/\//, '').replace(/\/$/, '') || site.domain
  const scripts = page ? `${page.scripts} script${page.scripts === 1 ? '' : 's'}` : ''
  // Three things, in the order they are checked. Only the second can verify
  // the install: this site's own id, found where a browser would load it.
  const reachStep = (): Step => {
    if (!page || pend.page) return { tone: 'wait', title: 'Your homepage', text: `Loading https://${site.domain}/…` }
    if (page.error) return { tone: 'warn', title: 'Your homepage', text: `${page.error}.` }
    return { tone: 'ok', title: 'Your homepage', text: `${where} answered (${page.status}).` }
  }
  const snippetStep = (): Step => {
    if (!page || pend.page) return { tone: 'wait', title: "This site's snippet", text: 'Looking in the page and the scripts it loads…' }
    if (page.error) return { tone: 'info', title: "This site's snippet", text: 'Not checked: the page could not be read.' }
    if (page.found === 'site')
      return {
        tone: 'ok',
        title: "This site's snippet",
        text: page.via === 'page' ? `Found in the page, with this site's id.` : `Found in a script the page loads: ${page.via?.replace(/^https?:\/\//, '')}`,
      }
    if (page.found === 'other' || page.found === 'nosite') return { tone: 'warn', title: "This site's snippet", text: `trckable is on ${where}, but ${page.found === 'other' ? "with another site's id" : 'without any site id'}. Copy the code below again.` }
    return { tone: 'warn', title: "This site's snippet", text: `Not in the page or in the ${scripts} it loads. Add the code below to your homepage's <head>.` }
  }
  const visitsStep = (): Step => {
    if (pend.visits) return { tone: 'wait', title: 'Visits arriving', text: 'Asking for the latest visit…' }
    if (fresh) return { tone: 'ok', title: 'Visits arriving', text: `The last one ${seen}.` }
    return { tone: 'warn', title: 'No visits in the last day', text: `The last one was ${seen}.` }
  }
  const reach = reachStep()
  const snippet = snippetStep()
  const visits = visitsStep()
  const verified = !checking && snippet.tone === 'ok'
  const showCode = code ?? (!checking && !verified)
  const headText = () => {
    if (checking) return `Checking ${site.domain}…`
    if (verified) return fresh ? `Connected and verified` : `Snippet found, but no visits in the last day`
    return page?.found === 'other' ? `Not verified: another site's snippet` : `Not verified`
  }
  const subText = () => {
    if (checking) return 'This server fetches your homepage and up to 20 scripts it links to, looks for this site\'s id in them, then asks for the latest visit it recorded.'
    if (verified) return fresh ? `This site's snippet is on ${site.domain} and visits are arriving from it.` : 'The snippet is in place. Visits show up here within seconds of someone opening a page.'
    if (page?.error) return `${site.domain} could not be read, so the snippet could not be found. Until it can, the install is not verified.`
    return `This site's id is not on ${site.domain}'s homepage${fresh ? ', though visits did arrive — the snippet may be on some pages only' : ''}.`
  }
  const head = headText()
  const sub = subText()
  // The mark beside the heading: done, working on it, or needs a look.
  const markIcon = () => {
    if (verified) return <CircleCheck size={18} strokeWidth={1.75} />
    if (checking) return <Activity size={18} strokeWidth={1.75} />
    return <TriangleAlert size={18} strokeWidth={1.75} />
  }
  const markTone = () => {
    if (verified && fresh) return ' accent'
    return checking ? '' : ' warn'
  }

  return (
    <>
      <section className="card install-check" aria-busy={checking}>
        <div className="install-check-head">
          <span className={'icon-tile' + markTone()} aria-hidden="true">
            {markIcon()}
          </span>
          <div>
            <h3>{head}</h3>
            <p className="muted">{sub}</p>
            {at && !checking && (
              <span className="install-at faint" key={at.getTime()}>
                Checked at {at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
          <button type="button" className="btn" onClick={() => check(true)} disabled={checking}>
            {checking ? <span className="btn-spin" aria-hidden="true" /> : <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />}
            {checking ? 'Checking…' : 'Verify again'}
          </button>
        </div>
        <ul className="install-steps">
          {[reach, snippet, visits].map((s) => (
            <li key={s.title} className={'install-step ' + s.tone}>
              <span className="install-step-mark" aria-hidden="true" key={s.tone}>
                <StepMark tone={s.tone} />
              </span>
              <span>
                <b>{s.title}</b>
                <span className="faint">{s.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="btn ghost install-more" aria-expanded={showCode} onClick={() => setCode(!showCode)}>
        <ChevronRight size={15} strokeWidth={1.75} style={{ transform: showCode ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} aria-hidden="true" />
        {showCode ? 'Hide the code' : 'Show the code again'}
      </button>
      {showCode && <Install site={site} visits={[]} variant="settings" />}
    </>
  )
}

type Step = { tone: 'ok' | 'warn' | 'info' | 'wait'; title: string; text: string }

function StepMark({ tone }: { tone: Step['tone'] }) {
  if (tone === 'ok') return <Check size={14} strokeWidth={2.25} />
  if (tone === 'wait') return <span className="btn-spin" />
  if (tone === 'info') return <InfoIcon size={14} strokeWidth={2} />
  return <TriangleAlert size={14} strokeWidth={2} />
}

/** Whether a moment was within the last day. */
function withinDay(ts: number): boolean {
  return Date.now() - ts < 86_400_000
}

function agoText(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  return d === 1 ? 'a day ago' : `${d} days ago`
}

/** "Saved" that fades away, so a save needs no button and no banner. */
function useSaved() {
  const [saved, setSaved] = useState(false)
  return [saved, () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }] as const
}

/** The end of the General tab: deleting the site, with the same dialog as
 *  the sites list (it asks for the domain and says what goes with it). */
function DangerZone({ site, onSites }: { site: Site; onSites: () => void }) {
  const [drop, setDrop] = useState(false)
  return (
    <section className="card danger-zone" style={{ gap: 0 }}>
      <Row label="Delete this site" hint="Its visits, payments, settings and share links go with it. There is no undo." tone="danger">
        <button type="button" className="btn danger" onClick={() => setDrop(true)}>
          Delete site
        </button>
      </Row>
      {drop && (
        <DeleteSite
          site={site}
          onClose={() => setDrop(false)}
          onSites={() => {
            closeSettings()
            onSites()
          }}
        />
      )}
    </section>
  )
}

const STATE_TEXT: Record<SiteState, string> = { live: 'Receiving visits', quiet: 'No visits in the last day', stopped: 'Stopped', new: 'Not installed yet' }

function SiteSettings({ site, onSaved }: { site: Site; onSaved: () => void }) {
  const [name, setName] = useState(site.name)
  const [saved, flash] = useSaved()
  const save = (patch: { name?: string; timezone?: string; currency?: string }) =>
    more
      .updateSite(site.id, { name, ...patch })
      .then(() => {
        flash()
        onSaved()
      })
      .catch((e: unknown) => fail(e))

  const state = siteState(site)
  const stateText = STATE_TEXT[state]
  return (
    <>
    <section className="gen-head">
      <SiteMark site={site} size={44} />
      <span className="gen-head-text">
        <b>{site.name || site.domain}</b>
        <span className="faint">
          {site.domain} · {site.timezone.replace(/_/g, ' ')} · {site.currency}
        </span>
      </span>
      <span className={'gen-state ' + state}>{stateText}</span>
    </section>

    <section className="card" style={{ gap: 0 }}>
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>Basics</h2>
        <span className={saved ? 'saved on' : 'saved'} aria-live="polite">
          Saved
        </span>
      </div>

      <Row label="Display name" hint="What you call this site in trckable">
        <InlineEdit
          label="Display name"
          width={260}
          value={site.name || site.domain}
          placeholder={site.domain}
          onSave={(n) =>
            more.updateSite(site.id, { name: n || site.domain }).then(() => {
              setName(n || site.domain)
              flash()
              onSaved()
            })
          }
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
    </section>

    <section className="card" style={{ gap: 0 }}>
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>For developers</h2>
      </div>
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

    </section>
    </>
  )
}

// A few colours that read well on both themes, and any other with the picker.
const SWATCHES = ['#b8ff3c', '#3ddc97', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb7185', '#fb923c', '#facc15']

/** How the site looks in trckable: its icon and its colour, in the site
 *  picker, All sites and the header. Nothing a visitor ever sees. */
function SiteLook({ site, onSaved }: { site: Site; onSaved: () => void }) {
  const file = useRef<HTMLInputElement>(null)
  const colourTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [cropping, setCropping] = useState<File | null>(null)
  const [busy, setBusy] = useState<'favicon' | 'remove' | null>(null)
  const act = (what: 'favicon' | 'remove', run: () => Promise<unknown>, said: string) => {
    setBusy(what)
    // At least a moment of "Looking…": a quick no used to look like nothing.
    const t0 = Date.now()
    const settled = (fn: () => void) => setTimeout(fn, Math.max(0, 600 - (Date.now() - t0)))
    run()
      .then(() =>
        settled(() => {
          toast(said)
          onSaved()
          setBusy(null)
        }),
      )
      .catch((e: unknown) =>
        settled(() => {
          fail(e)
          setBusy(null)
        }),
      )
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
        <button type="button" className="btn" disabled={!!busy} onClick={() => act('favicon', () => more.fetchSiteFavicon(site.id), 'Using the site\'s favicon')}>
          {busy === 'favicon' && <span className="btn-spin" aria-hidden="true" />}
          {busy === 'favicon' ? `Looking at ${site.domain}…` : 'Use its favicon'}
        </button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          Upload
        </button>
        {site.icon_url && (
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => act('remove', () => more.clearSiteIcon(site.id), 'Icon removed')}>
            Remove
          </button>
        )}
      </Row>
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
              style={{ backgroundColor: c }}
              onClick={() => more.setSiteColor(site.id, c).then(onSaved).catch((e: unknown) => fail(e))}
            />
          ))}
          <label className="swatch custom" title="Another colour">
            <input
              type="color"
              defaultValue={site.color || '#b8ff3c'}
              onChange={(e) => {
                // Dragging through the picker changes it many times a second:
                // saved once, when the hand stops.
                const c = e.target.value
                clearTimeout(colourTimer.current)
                colourTimer.current = setTimeout(() => {
                  more.setSiteColor(site.id, c).then(onSaved).catch((err: unknown) => fail(err))
                }, 400)
              }}
              aria-label="Another colour"
            />
          </label>
          {site.color && (
            <button type="button" className="btn ghost small" onClick={() => more.setSiteColor(site.id, '').then(onSaved).catch((e: unknown) => fail(e))}>
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
            onSave={(picture) => more.setSiteIcon(site.id, picture)}
            onDone={() => {
              setCropping(null)
              toast('Icon saved')
              onSaved()
            }}
          />
        </Suspense>
      )}
    </section>
  )
}

/** A value you copy, hidden until asked for when it is a secret. */

export { Row }
