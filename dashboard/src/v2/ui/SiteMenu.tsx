// The site in the header, and the list that opens from it (SiteList): the current team's sites with today's visitors, a finder
// for a long list, and what belongs to this site. A build with teams puts their square before the site. The check beside the name says when something independent vouches for the numbers.
import { Suspense, useCallback, useRef, type ReactNode } from 'react'
import type { Site } from '../../lib/api'
import { lazyLoad, warm } from '../../lib/lazyLoad'
import { layoutReady, preloadLayout } from '../../features/sites/useSiteLayout'
import { dotState, type DotState } from '../../features/sites/StateDot'
import { useDomainControl } from '../../lib/domainControl'
import { copy } from '../copy'
import { domainLabel } from './DomainRows'
import { MenuFoot, type FootItem } from './MenuFoot'
import { useMenu } from './useMenu'
import { useOnlyOpen } from '../../lib/headerMenu'
import { useTopLayerWhen } from '../../lib/topLayer'
import { midEllipsis } from '../../lib/midEllipsis'
import { MarkDot } from '../../features/sites/MarkDot'

const SiteList = lazyLoad(() => import('./SiteList').then((m) => ({ default: m.SiteList })))
const warmUp = () => {
  SiteList.preload()
  preloadLayout()
}
/** The list opens whole and in its final order: its chunk is waited for, and the layout (300 ms at most), rather than shown late. */
const LAYOUT_WAIT = 300

interface SiteMenuProps {
  sites: Site[]
  current: Site | null
  /** No verified install yet: the chip's dot is the not-installed one, and its name says so. */
  unverified?: boolean
  /** The teams' square, before the site, when the build has teams. */
  team?: ReactNode
  onPick: (id: string) => void
  footer: FootItem[]
  find: string
  all: string
}

/** The button's name for a screen reader and its tooltip: the site, and its state when it is not fine ("drivemymac.app · Not verified"). */
export function siteLabel(name: string, state: DotState): string {
  const word = { stopped: copy.stateDown, quiet: copy.stateQuiet, new: copy.notVerified }[state as 'stopped' | 'quiet' | 'new']
  return word ? `${name} · ${word}` : name
}

/** The site's name, cut in the middle when it is long: the whole name stays in the tooltip and for a screen reader. */
function NameText({ cur, all }: { cur: Site | null; all: string }) {
  if (!cur) return <span className="nmx">{all}</span>
  const full = cur.name || cur.domain
  const short = midEllipsis(full, 26)
  if (short === full) return <span className="nmx">{full}</span>
  return (
    <span className="nmx" title={full}>
      <span aria-hidden="true">{short}</span>
      <span className="sr">{full}</span>
    </span>
  )
}

/** The button's state: not installed only while the page itself says nothing is verified (its sites list may still be the old one a moment after the first visit), else the site's own. */
const stateOf = (cur: Site | null, unverified?: boolean): DotState => {
  if (!cur) return 'live'
  if (unverified) return 'new'
  const state = dotState(cur)
  return state === 'new' ? 'live' : state
}

export function SiteChip({ p }: { p: SiteMenuProps }) {
  const { open, setOpen, attach, close } = useMenu()
  useOnlyOpen('sites', open, close)
  const menu = useRef<HTMLDivElement>(null)
  useTopLayerWhen(open, menu)
  const cur = p.current
  const domains = useDomainControl()
  const picked = cur && domains ? domainLabel(domains) : null
  const state = stateOf(cur, p.unverified)
  const label = cur ? siteLabel(cur.name || cur.domain, state) : undefined
  const toggle = () => {
    if (open) setOpen(false)
    else void Promise.all([layoutReady(LAYOUT_WAIT), SiteList.load()]).then(() => setOpen(true))
  }
  const done = useCallback(() => close(), [close])
  const footer = <MenuFoot items={p.footer} done={done} />
  return (
    <div ref={attach} style={{ position: 'relative' }} className="sitechip">
      {p.team}
      <button type="button" id="siteBtn" className={cur ? 'mk-chip' : 'mk-chip all'} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} data-key="site" {...warm(warmUp)} onClick={toggle}>
        {cur && <MarkDot site={cur} size={18} state={state} />}
        <NameText cur={cur} all={p.all} />
        {picked && <span className="dom">{`/ ${picked}`}</span>}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" stroke="var(--mk-muted)" fill="none" strokeWidth="1.5" />
        </svg>
      </button>
      <div ref={menu} className={`mk-menu sites${open ? ' on' : ''}`} id="siteMenu" role={open ? 'dialog' : undefined} aria-label={open ? copy.sites : undefined}>
        {open && (
          <Suspense fallback={null}>
            <SiteList
              sites={p.sites}
              current={cur}
              onPick={p.onPick}
              footer={footer}
              find={p.find}
              all={p.all}
              close={done}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
