// The header of every signed-in page: the ghost (all sites), the site (or "All sites"), and on a page that has them the
// Live | Briefing switch and the period; at the end ⌘K, the person's menu, what a hosted build adds, and the bell. One
// header, so the pages of the product look and behave as one.
import { useEffect, useState, type ReactNode } from 'react'
import type { Report, Site } from '../lib/api'
import { openAddSite } from '../lib/account'
import { liveCount, siteDown } from '../features/live/liveLink'
import { switchTab } from '../features/live/switchView'
import { AccountMenu } from '../components/AccountMenu'
import { appVersion, isShared, updateChecks } from '../lib/me'
import { useLatest } from '../lib/update'
import { SectionsButton } from './explore/SectionsButton'
import { SHARE_EVENT, ShareButton } from '../features/share/ShareButton'
import { can } from '../lib/permissions'
import { Settings } from 'lucide-react'
import { pressed } from '../lib/keys'
import { navigate } from '../lib/url'
import { openSettings } from '../lib/settings'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'
import { ghostSvg } from '../brand/logo'
import { Bell } from './bell/Bell'
import { useNotices } from './bell/useNotices'
import { copy } from './copy'
import { goHome } from './home'
import { peekAction } from './openPeek'
import { paletteItems } from './explore/palette'
import { copy as pal } from './explore/paletteCopy'
import { useV2Extras } from './slots'
import { ExploreChip, Header, Logo } from './ui/Header'
import { SegmentedSwitch } from './ui/SegmentedSwitch'
import { SiteChip } from './ui/SiteMenu'
import { DomainPicker } from './ui/DomainPicker'
import { TeamSquare } from './ui/TeamSquare'
import { SetupRing } from './setup/SetupRing'

const Palette = lazyLoad(() => import('./ui/Palette').then((m) => ({ default: m.Palette })))

export interface PageHeaderProps {
  sites: Site[]
  /** The site the page is about; none on a page that belongs to no site (All sites). */
  site: Site | null
  /** Live | Briefing, on the pages that have the two. */
  tab?: 'live' | 'briefing'
  /** The period, beside them (the Briefing's). */
  period?: ReactNode
  /** The Briefing's period id ("7d", "today"): the picture Share makes is of that stretch. */
  shareFor?: string
  /** What the ⌘K list knows about the page, beyond the sites and the tables. */
  data?: Report | null
  onAsk?: () => void
  onGoal?: () => void
  /** A goal was added from the header's Goals menu: the page reads its numbers again. */
  onGoalsChanged?: () => void
  /** A newer version of the product, when there is one: a small pill by the ghost. */
  update?: string
  onUpdate?: () => void
  /** The site has no verified install: its page is the setup screen, with no Live, Briefing, Explore or period, and the chip says so. */
  waiting?: boolean
  /** A visit has landed while the setup screen is still up. */
  visited?: boolean
  /** A shared link: whose numbers these are, in place of the ghost and the site menu; no Live, bell or person. */
  identity?: ReactNode
}

export function PageHeader(p: PageHeaderProps) {
  const online = liveCount.use()
  const down = siteDown.use()
  const slots = useV2Extras()
  // Explore and Live have no foot, so a new release is told here; a page that hands its own in keeps it.
  const latest = useLatest(appVersion(), updateChecks())
  const update = p.update ?? latest?.v
  const onUpdate = p.onUpdate ?? (() => window.dispatchEvent(new Event('trckable:update-open')))
  const notices = useNotices(p.sites)
  const viewer = !can('site.add')
  const [find, setFind] = useState(false)
  const [seed, setSeed] = useState('')
  const openFind = (q: string) => {
    setSeed(q)
    setFind(true)
  }
  useEffect(() => whenIdle(Palette.preload), [])
  // The phone's bar opens the same box.
  useEffect(() => {
    const on = () => openFind('')
    window.addEventListener('trckable:find', on)
    return () => window.removeEventListener('trckable:find', on)
  }, [])
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
  const pickSite = (id: string) => {
    navigate(id === '*' ? '/sites' : '/' + encodeURIComponent(p.sites.find((s) => s.id === id)?.domain ?? ''))
  }
  const siteMenu = {
    sites: p.sites,
    current: site,
    unverified: !!p.waiting && !p.visited,
    onPick: pickSite,
    footer: viewer ? [] : [{ key: 'add', label: copy.addSite, run: openAddSite }],
    team: slots.teams && <TeamSquare teams={slots.teams} />,
    find: copy.find,
    all: copy.allSites,
  }
  const here = p.tab
  // Peek is there only where the build gives one: a page's own, or the slot. The public product has none, so no row or button asks for it.
  const question = slots.askPeekNow
  const ask = peekAction(p.onAsk, slots.askPeekNow)
  // A page with a site opens Explore; a page without one has nothing to open it on, so ⌘K's list opens instead.
  // Where the build provides Peek, a question typed into ⌘K is asked at once.
  return (
    <>
      <Header
        logo={p.identity ? <div className="hd-id">{p.identity}</div> : (
          <>
            <Logo title={copy.home} onClick={() => goHome(site)} />
            {update && (
              <button type="button" className="update-pill" onClick={onUpdate} title={copy.updateOut(update)}>
                <span className="dot" aria-hidden="true" />
                <span className="num">{`v${update}`}</span>
                <span className="sr">{copy.upgrade}</span>
              </button>
            )}
          </>
        )}
        site={p.identity ? null : (
          // The site, its setup and its settings in one pill: the gear is one click, not the menu and a hover on its dots.
          <div className="sitegrp">
            <SiteChip p={siteMenu} />
            {site && <SetupRing site={site} onGoal={p.onGoal ?? (() => openFind(pal.create))} fresh={!!p.waiting} visited={!!p.visited} />}
            {site && can('site.settings') && !isShared() && (
              <button type="button" className="sitegear" aria-label={copy.settings} title={copy.settings} onClick={() => openSettings(site)}>
                <Settings size={15} strokeWidth={1.9} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        views={here && !p.identity && !p.waiting ? <SegmentedSwitch id="views" label={copy.view} value={here} onChange={(t) => void switchTab(t, here)} items={[{ value: 'live', label: copy.live, title: copy.liveTitle, dot: down ? 'down' : 'ok', count: online ?? undefined }, { value: 'briefing', label: copy.exploreTab, title: copy.briefingTitle }]} /> : null}
        period={
          <>
            {here === 'briefing' ? p.period : null}
            {site && <DomainPicker />}
          </>
        }
        goals={
          site && !p.waiting && !p.identity && !isShared() ? (
            <>
              {here === 'briefing' && <ShareButton site={site} sites={p.sites} period={p.shareFor} />}
              <SectionsButton />
            </>
          ) : null
        }
        explore={p.waiting ? null : <ExploreChip label="Search" kbd="⌘K" onClick={() => setFind(true)} />}
        extras={slots.headerExtra}
        bell={p.identity ? null : <Bell site={site} notices={notices} />}
        account={isShared() ? null : <AccountMenu alert={slots.accountAlert} />}
        keys={
          <>
            {site && !isShared() && !viewer && (
              <button type="button" className="sr" data-key="settings" tabIndex={-1} aria-hidden="true" onClick={() => openSettings(site)}>
                {copy.settings}
              </button>
            )}
            {/* On the Briefing the key opens the same sheet as the Share button; elsewhere it opens Settings → Sharing. */}
            {here && site && !isShared() && (here === 'briefing' || !viewer) && (
              <button type="button" className="sr" data-key="share" tabIndex={-1} aria-hidden="true" onClick={() => (here === 'briefing' ? window.dispatchEvent(new Event(SHARE_EVENT)) : openSettings(site, 'sharing'))}>
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
      {find && <Palette items={paletteItems({ sites: p.sites, site, data: p.data ?? null, here: here ?? 'briefing', fresh: p.waiting, onAsk: question ? undefined : ask, onGoal: p.onGoal, extra: slots.paletteRows, domainOf: (s) => s.domain })} placeholder={question ? pal.placeholderAsk : pal.placeholder} ask={question && { run: question, title: pal.askRow, kind: pal.askKey, lead: ghostSvg(16) }} none={pal.none} initial={seed} onClose={() => setFind(false)} />}
    </>
  )
}
