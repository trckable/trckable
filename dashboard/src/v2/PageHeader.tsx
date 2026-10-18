// The header of every signed-in page: the ghost (all sites), the site (or "All sites"), and on a page that has them the
// Live | Briefing switch and the period; at the end ⌘K, the person's menu, what a hosted build adds, and the bell. One
// header, so the pages of the product look and behave as one.
import { useEffect, useState, type ReactNode } from 'react'
import type { Report, Site } from '../lib/api'
import { openAddSite } from '../lib/account'
import { liveCount, siteDown } from '../features/live/liveLink'
import { switchTab } from '../features/live/switchView'
import { AccountMenu } from '../components/AccountMenu'
import { isShared } from '../lib/me'
import { can } from '../lib/permissions'
import { pressed } from '../lib/keys'
import { navigate } from '../lib/url'
import { openSettings } from '../lib/settings'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'
import { ghostSvg } from '../brand/logo'
import { Bell } from './bell/Bell'
import { useNotices } from './bell/useNotices'
import { goExplore } from './briefing/deeper'
import { copy } from './copy'
import { goHome } from './home'
import { peekAction } from './openPeek'
import { paletteItems } from './explore/palette'
import { copy as pal } from './explore/paletteCopy'
import { useV2Extras } from './slots'
import { ExploreChip, Header, Logo } from './ui/Header'
import { SegmentedSwitch } from './ui/SegmentedSwitch'
import { SiteChip } from './ui/SiteMenu'
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
  /** What the ⌘K list knows about the page, beyond the sites and the tables. */
  data?: Report | null
  onAsk?: () => void
  onGoal?: () => void
  /** A newer version of the product, when there is one: a small pill by the ghost. */
  update?: string
  onUpdate?: () => void
  /** The site has no verified install: its page is the setup screen, with no Live, Briefing, Explore or period, and the chip says so. */
  waiting?: boolean
  /** A visit has landed while the setup screen is still up. */
  visited?: boolean
  /** The site picked in the site menu, where the page keeps its own (the first run switches between the sites it added). */
  onPickSite?: (id: string) => void
  /** A shared link: whose numbers these are, in place of the ghost and the site menu; no Live, bell or person. */
  identity?: ReactNode
}

export function PageHeader(p: PageHeaderProps) {
  const online = liveCount.use()
  const down = siteDown.use()
  const slots = useV2Extras()
  const notices = useNotices(p.site, p.sites)
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
    if (p.onPickSite) p.onPickSite(id)
    else navigate(id === '*' ? '/sites' : '/' + encodeURIComponent(p.sites.find((s) => s.id === id)?.domain ?? ''))
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
  const ask = peekAction(p.onAsk, slots.askPeek)
  // A page with a site opens Explore; a page without one has nothing to open it on, so ⌘K's list opens instead.
  // Where the build provides Peek, a question typed into ⌘K goes to it, with the question as the draft.
  const question = slots.askPeek
  const exploreOpen = () => (site ? goExplore() : setFind(true))
  return (
    <>
      <Header
        logo={p.identity ? <div className="hd-id">{p.identity}</div> : (
          <>
            <Logo title={copy.home} onClick={() => goHome(site)} />
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
        ring={p.identity || !site ? null : <SetupRing site={site} onGoal={p.onGoal ?? (() => openFind(pal.create))} fresh={!!p.waiting} visited={!!p.visited} />}
        views={here && !p.identity && !p.waiting ? <SegmentedSwitch id="views" label={copy.view} value={here} onChange={(t) => void switchTab(t, here)} items={[{ value: 'live', label: copy.live, title: copy.liveTitle, dot: down ? 'down' : 'ok', count: online ?? undefined }, { value: 'briefing', label: copy.briefing, title: copy.briefingTitle }]} /> : null}
        period={here === 'briefing' ? p.period : null}
        explore={p.waiting ? null : <ExploreChip label={question ? copy.askOrSearch : copy.explore} kbd="⌘K" onClick={question ? () => setFind(true) : exploreOpen} />}
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
      {find && <Palette items={paletteItems({ sites: p.sites, site, data: p.data ?? null, here: here ?? 'briefing', fresh: p.waiting, onAsk: question ? undefined : ask, onGoal: p.onGoal, extra: slots.paletteRows, domainOf: (s) => s.domain })} placeholder={question ? pal.placeholderAsk : pal.placeholder} ask={question && { run: question, title: pal.askRow, kind: pal.askKey, lead: ghostSvg(16) }} none={pal.none} initial={seed} onClose={() => setFind(false)} />}
    </>
  )
}
