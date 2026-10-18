import { Activity, Bell, Code, CreditCard, Ghost, LayoutTemplate, Search, Newspaper, Settings as Cog, Share2, ShieldCheck, StickyNote } from 'lucide-react'
import { Suspense, lazy, useRef, useState } from 'react'
import { hasAnswers, hasMentions } from '../lib/me'
import { can } from '../lib/permissions'
import { siteState, fail, type Site, type SiteState, more } from '../lib/apiMore'
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
import { ScriptRecords } from './ScriptRecords'
import { PaymentsSettings } from './Payments'
import { PrivacyTab, ReportSettings } from '../features/privacy/PrivacyTab'
import { Locked } from '../components/Locked'
import { Shares } from './Shares'
import { WidgetsSettings } from './Widgets'
import { HealthSettings } from './Health'
import { AlertsTab } from '../features/reports/AlertsTab'
import { SearchSettings } from './Search'
import { NotesSettings } from '../features/notes/NotesSettings'
import { MilestonesSetting } from '../features/milestones/MilestonesSetting'
import { ImportSetting } from '../features/install/ImportSetting'
import { DeleteSite } from './Sites'
import { CURRENCIES, withCurrent, zones } from '../lib/site'
import { SavedFlag, useSaved } from '../components/SavedFlag'
import { InstallSection } from './InstallSection'
import './Settings.css'

type TabID = SettingsTab
const IconCrop = lazy(() => import('../components/AvatarCrop'))
const AnswersSettings = lazy(() => import('../features/answers/AnswersSettings'))
const MentionsSettings = lazy(() => import('../features/mentions/MentionsSettings'))

// Only the open site lives here. Anything about the account — the list of
// sites, keys, the password — is one dialog away (see AccountDialog), so the
// two can never be mistaken for each other.
const TABS: { id: TabID; label: string; icon: typeof Cog }[] = [
  { id: 'site', label: 'General', icon: Cog },
  { id: 'install', label: 'Install', icon: Code },
  { id: 'sharing', label: 'Sharing', icon: Share2 },
  { id: 'widgets', label: 'Widgets', icon: LayoutTemplate },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'search', label: 'Search Console', icon: Search },
  { id: 'mentions', label: 'Mentions', icon: Newspaper },
  { id: 'answers', label: 'Answers', icon: Ghost },
  { id: 'privacy', label: 'Data & privacy', icon: ShieldCheck },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'health', label: 'Health', icon: Activity },
]

// The dialog's menu, grouped the way an owner looks for things.
const GROUPS: { name: string; tabs: TabID[] }[] = [
  { name: 'This site', tabs: ['site', 'install', 'sharing', 'widgets', 'notes'] },
  { name: 'Money', tabs: ['payments'] },
  { name: 'Data', tabs: ['search', 'mentions', 'answers', 'privacy', 'alerts'] },
  { name: 'Instance', tabs: ['health'] },
]
/** A site's settings as a dialog over its dashboard: the sections on the
 *  left, the section on the right. Opening it does not change the address
 *  (lib/settings.ts); closing it leaves the dashboard exactly as it was. */
export function SettingsDialog(p: { sites: Site[]; site: Site; tab: TabID; onSites: () => void }) {
  const tab = TABS.some((t) => t.id === p.tab && (t.id !== 'mentions' || hasMentions()) && (t.id !== 'answers' || hasAnswers())) ? p.tab : 'site'
  const go = (id: TabID) => setSettingsTab(id)
  const close = closeSettings
  // Once visits arrive there is nothing left to install, only to verify.
  const label = (t: (typeof TABS)[number]) => (t.id === 'install' && p.site.last_event_at ? 'Verify' : t.label)
  const tabs: WindowTab[] = GROUPS.flatMap((g) =>
    g.tabs.flatMap((id) => {
      const t = TABS.find((x) => x.id === id)
      return t && (id !== 'mentions' || hasMentions()) && (id !== 'answers' || hasAnswers()) ? [{ id: t.id, label: label(t), icon: t.icon, group: g.name }] : []
    }),
  )
  return (
    <Window label={`Settings for ${p.site.domain}`} head={<SettingsHead site={p.site} />} tabs={tabs} tab={tab} onTab={(id) => go(id as TabID)} onClose={close} listFirst={p.tab === 'site'}>
      <SettingsSection tab={tab} site={p.site} onSites={p.onSites} />
    </Window>
  )
}

function SettingsSection({ tab, site, onSites }: { tab: TabID; site: Site; onSites: () => void }) {
  return (
    <>
      {/* Saying it once is kinder than letting every save come back 403. */}
      {!can('site.settings') && <p className="viewer-note">Your account reads this instance. Settings are shown as they are, and an owner changes them.</p>}
      {tab === 'site' && (
        <>
          <SiteSettings key={site.id} site={site} onSaved={onSites} />
          <ScriptRecords key={'sr' + site.id} site={site} />
          <Locked><SiteLook site={site} onSaved={onSites} /><ReportSettings key={'r' + site.id} site={site} onSites={onSites} /></Locked>
          {can('site.delete') && <DangerZone site={site} onSites={onSites} />}
        </>
      )}
      {tab === 'sharing' && <Shares key={'sh' + site.id} site={site} />}
      {/* Widgets go on your own pages, so they are their own section, not a kind of share. */}
      {tab === 'widgets' && <Locked><WidgetsSettings key={'wg' + site.id} site={site} /></Locked>}
      {tab === 'install' && <><InstallSection site={site} /><ImportSetting key={'im' + site.id} site={site} /></>}
      {tab === 'notes' && <><NotesSettings key={'n' + site.id} site={site} /><MilestonesSetting key={'ms' + site.id} site={site} /></>}
      {tab === 'payments' && <PaymentsSettings key={'pay' + site.id} site={site} onSiteChange={onSites} />}
      {tab === 'search' && <Locked><SearchSettings key={'sc' + site.id} site={site} /></Locked>}
      {tab === 'mentions' && <Suspense fallback={null}><MentionsSettings key={'mn' + site.id} site={site} /></Suspense>}
      {tab === 'answers' && <Suspense fallback={null}><AnswersSettings key={'an' + site.id} site={site} /></Suspense>}
      {tab === 'privacy' && <Locked><PrivacyTab key={'pv' + site.id} site={site} onSites={onSites} /></Locked>}
      {tab === 'alerts' && <Locked><AlertsTab key={'al' + site.id} site={site} /></Locked>}
      {tab === 'health' && <HealthSettings />}
    </>
  )
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

const STATE_TEXT: Record<SiteState, string> = { live: 'Receiving visits', quiet: 'No visits for hours', stopped: 'Down', new: 'Not installed yet' }

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
    <section className="card" style={{ gap: 0 }}>
      <div className="card-head" style={{ paddingBottom: 10 }}>
        <h2>Basics</h2>
        <span className={'gen-state ' + state}>{stateText}</span>
        <SavedFlag on={saved} />
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
          placeholder="Search a city or zone…"
          value={site.timezone}
          onPick={(timezone) => save({ timezone })}
          items={withCurrent(zones, site.timezone, (z) => z.replace(/_/g, ' '))}
        />
      </Row>

      <Row label="Currency" hint="Revenue is converted at the payment date">
        <Picker
          label="Currency"
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
