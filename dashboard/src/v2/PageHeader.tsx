// The header of every signed-in page: the ghost (all sites), the site (or "All sites"), and on a page that has them the
// Live | Briefing switch and the period; at the end ⌘K, the person's menu, what a hosted build adds, and the bell. One
// header, so the pages of the product look and behave as one.
import { useEffect, useState, type ReactNode } from 'react'
import type { Report, Site } from '../lib/api'
import { openAddSite } from '../lib/account'
import { liveCount, siteDown } from '../features/live/liveLink'
import { switchTab } from '../features/live/switchView'
import { AccountMenu } from '../components/AccountMenu'
import { isShared, isViewer } from '../lib/me'
import { navigate } from '../lib/url'
import { openSettings } from '../lib/settings'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'
import { useOverview } from '../views/useOverview'
import { Bell } from './bell/Bell'
import { useNotices } from './bell/useNotices'
import { goExplore } from './briefing/deeper'
import { copy } from './copy'
import { paletteItems } from './explore/palette'
import { copy as pal } from './explore/paletteCopy'
import { useV2Extras } from './slots'
import { ExploreChip, Header, Logo } from './ui/Header'
import { SegmentedSwitch } from './ui/SegmentedSwitch'
import { SiteChip, type SiteItem } from './ui/SiteMenu'

const Palette = lazyLoad(() => import('./ui/Palette').then((m) => ({ default: m.Palette })))

export interface PageHeaderProps {
  sites: Site[]
  /** The site the page is about; none on a page that belongs to no site (All sites). */
  site: Site | null
  /** Live | Briefing, on the pages that have the two. */
  tab?: 'live' | 'briefing'
  /** The period, beside them (the Briefing's). */
  period?: ReactNode
  /** What the ⌘K list knows about the page, beyond the sites and the tables. */
  data?: Report | null
  onAsk?: () => void
  /** A newer version of the product, when there is one: a small pill by the ghost. */
  update?: string
  onUpdate?: () => void
}

/** The dot by "Tracking & script check": amber while the snippet is not found or nothing has arrived. */
const tracking = (s: Site): 'ok' | 'warn' => (s.last_event_at && s.check?.found !== 'none' && s.check?.found !== 'nosite' ? 'ok' : 'warn')

export function PageHeader(p: PageHeaderProps) {
  const online = liveCount.use()
  const down = siteDown.use()
  const slots = useV2Extras()
  const notices = useNotices(p.site, p.sites)
  const { rows } = useOverview(1)
  const viewer = isViewer()
  const [find, setFind] = useState(false)
  useEffect(() => whenIdle(Palette.preload), [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setFind((f) => !f)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  const items: SiteItem[] = p.sites.map((s) => ({ id: s.id, name: s.name || s.domain, note: s.domain === s.name ? undefined : s.domain, online: rows?.find((r) => r.id === s.id)?.online ?? 0, down: !!s.down_since }))
  const site = p.site
  const siteMenu = {
    sites: items,
    current: site?.id ?? null,
    onPick: (id: string) => (id === '*' ? navigate('/') : navigate('/' + encodeURIComponent(p.sites.find((s) => s.id === id)?.domain ?? ''))),
    footer: site
      ? [
          { key: 'install', label: copy.track, dot: tracking(site), run: () => openSettings(site, 'install') },
          { key: 'add', label: copy.addSite, run: openAddSite },
          { key: 'share', label: copy.share, run: () => openSettings(site, 'sharing') },
          { key: 'status', label: copy.statusPage, run: () => navigate(`/${encodeURIComponent(site.domain)}/incidents`) },
          { key: 'widgets', label: copy.widgets, run: () => openSettings(site, 'widgets') },
          { key: 'settings', label: copy.settings, run: () => openSettings(site, 'site') },
        ].filter((f) => !viewer || f.key === 'status')
      : [{ key: 'add', label: copy.addSite, run: openAddSite }].filter(() => !viewer),
    workspace: slots.workspace,
    find: copy.find,
    all: copy.allSites,
  }
  const here = p.tab
  // A page with a site opens Explore; a page without one has nothing to open it on, so ⌘K's list opens instead.
  const exploreOpen = () => (site ? goExplore() : setFind(true))
  return (
    <>
      <Header
        logo={
          <>
            <Logo title={copy.allSites} onClick={() => navigate('/')} />
            {p.update && (
              <button type="button" className="update-pill" onClick={p.onUpdate} title={copy.updateOut(p.update)}>
                <span className="dot" aria-hidden="true" />
                <span className="num">{`v${p.update}`}</span>
                <span className="sr">{copy.upgrade}</span>
              </button>
            )}
          </>
        }
        site={<SiteChip p={siteMenu} />}
        views={here ? <SegmentedSwitch id="views" label={copy.view} value={here} onChange={(t) => void switchTab(t, here)} items={[{ value: 'live', label: copy.live, title: copy.liveTitle, dot: down ? 'down' : 'ok', count: online ?? undefined }, { value: 'briefing', label: copy.briefing, title: copy.briefingTitle }]} /> : null}
        period={here === 'briefing' ? p.period : null}
        explore={<ExploreChip label={copy.explore} kbd="⌘K" onClick={exploreOpen} />}
        extras={slots.headerExtra}
        bell={<Bell site={site} notices={notices} />}
        account={isShared() ? null : <AccountMenu site={site ?? undefined} />}
      />
      {find && <Palette items={paletteItems({ sites: p.sites, site, data: p.data ?? null, here: here ?? 'briefing', onAsk: p.onAsk, domainOf: (s) => s.domain })} placeholder={pal.placeholder} none={pal.none} onClose={() => setFind(false)} />}
    </>
  )
}
