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
import { pressed } from '../lib/keys'
import { navigate } from '../lib/url'
import { openSettings } from '../lib/settings'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'
import { Bell } from './bell/Bell'
import { useNotices } from './bell/useNotices'
import { goExplore } from './briefing/deeper'
import { copy } from './copy'
import { openPeek } from './openPeek'
import { paletteItems } from './explore/palette'
import { copy as pal } from './explore/paletteCopy'
import { useV2Extras } from './slots'
import { ExploreChip, Header, Logo } from './ui/Header'
import { SegmentedSwitch } from './ui/SegmentedSwitch'
import { SiteChip } from './ui/SiteMenu'

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
  onGoal?: () => void
  /** A newer version of the product, when there is one: a small pill by the ghost. */
  update?: string
  onUpdate?: () => void
  /** A shared link: whose numbers these are, in place of the ghost and the site menu; no Live, bell or person. */
  identity?: ReactNode
}

/** The dot by "Tracking & script check": amber while the snippet is not found or nothing has arrived. */
const tracking = (s: Site): 'ok' | 'warn' => (s.last_event_at && s.check?.found !== 'none' && s.check?.found !== 'nosite' ? 'ok' : 'warn')

export function PageHeader(p: PageHeaderProps) {
  const online = liveCount.use()
  const down = siteDown.use()
  const slots = useV2Extras()
  const notices = useNotices(p.site, p.sites)
  const viewer = isViewer()
  const [find, setFind] = useState(false)
  const [seed, setSeed] = useState('')
  const openFind = (q: string) => {
    setSeed(q)
    setFind(true)
  }
  useEffect(() => whenIdle(Palette.preload), [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (pressed(e, 'ask')) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setSeed('')
        setFind((f) => !f)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  const site = p.site
  const siteMenu = {
    sites: p.sites,
    current: site,
    onPick: (id: string) => (id === '*' ? navigate('/') : navigate('/' + encodeURIComponent(p.sites.find((s) => s.id === id)?.domain ?? ''))),
    footer: site
      ? [
          { key: 'add', label: copy.addSite, run: openAddSite },
          { key: 'settings', label: copy.settings, run: () => openSettings(site, 'site') },
          { key: 'install', label: copy.track, dot: tracking(site), run: () => openSettings(site, 'install'), more: true },
          { key: 'share', label: copy.share, run: () => openSettings(site, 'sharing'), more: true },
          { key: 'status', label: copy.statusPage, run: () => navigate(`/${encodeURIComponent(site.domain)}/incidents`), more: true },
          { key: 'widgets', label: copy.widgets, run: () => openSettings(site, 'widgets'), more: true },
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
        logo={p.identity ? <div className="hd-id">{p.identity}</div> : (
          <>
            <Logo title={copy.askPeek} onClick={p.onAsk ?? openPeek} />
            {p.update && (
              <button type="button" className="update-pill" onClick={p.onUpdate} title={copy.updateOut(p.update)}>
                <span className="dot" aria-hidden="true" />
                <span className="num">{`v${p.update}`}</span>
                <span className="sr">{copy.upgrade}</span>
              </button>
            )}
          </>
        )}
        site={p.identity ? null : <SiteChip p={siteMenu} />}
        views={here && !p.identity ? <SegmentedSwitch id="views" label={copy.view} value={here} onChange={(t) => void switchTab(t, here)} items={[{ value: 'live', label: copy.live, title: copy.liveTitle, dot: down ? 'down' : 'ok', count: online ?? undefined }, { value: 'briefing', label: copy.briefing, title: copy.briefingTitle }]} /> : null}
        period={here === 'briefing' ? p.period : null}
        explore={<ExploreChip label={copy.explore} kbd="⌘K" onClick={exploreOpen} />}
        extras={slots.headerExtra}
        bell={p.identity ? null : <Bell site={site} notices={notices} />}
        account={isShared() ? null : <AccountMenu site={site ?? undefined} alert={slots.accountAlert} />}
        keys={
          <>
            {site && !isShared() && !viewer && (
              <button type="button" className="sr" data-key="settings" tabIndex={-1} aria-hidden="true" onClick={() => openSettings(site)}>
                {copy.settings}
              </button>
            )}
            {/* Share and Filter have their own buttons on a page that is not Live or the Briefing: the key is theirs there. */}
            {here && site && !isShared() && !viewer && (
              <button type="button" className="sr" data-key="share" tabIndex={-1} aria-hidden="true" onClick={() => openSettings(site, 'sharing')}>
                {copy.share}
              </button>
            )}
            {here && (
              <button type="button" className="sr" data-key="filter" tabIndex={-1} aria-hidden="true" onClick={() => openFind('')}>
                {copy.filter}
              </button>
            )}
            {here && !viewer && (
              <button type="button" className="sr" data-key="create" tabIndex={-1} aria-hidden="true" onClick={() => openFind(pal.create)}>
                {pal.create}
              </button>
            )}
          </>
        }
      />
      {find && <Palette items={paletteItems({ sites: p.sites, site, data: p.data ?? null, here: here ?? 'briefing', onAsk: p.onAsk ?? openPeek, onGoal: p.onGoal, domainOf: (s) => s.domain })} placeholder={pal.placeholder} none={pal.none} initial={seed} onClose={() => setFind(false)} />}
    </>
  )
}
