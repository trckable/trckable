// The site in the header, and the list that opens from it (SiteList): the current team's sites with today's visitors, a finder
// for a long list, and what belongs to this site. A build with teams puts their square before the site. The check beside the name says when something independent vouches for the numbers.
import { Suspense, useCallback, useRef, type ReactNode } from 'react'
import type { Site } from '../../lib/api'
import { lazyLoad, warm } from '../../lib/lazyLoad'
import { layoutReady, preloadLayout } from '../../features/sites/useSiteLayout'
import { dotState } from '../../features/sites/StateDot'
import { useDomainControl } from '../../lib/domainControl'
import { copy } from '../copy'
import { domainLabel } from './DomainRows'
import { MenuFoot, type FootItem } from './MenuFoot'
import { useMenu } from './useMenu'
import { useOnlyOpen } from '../../lib/headerMenu'
import { useTopLayerWhen } from '../../lib/topLayer'
import { midEllipsis } from '../../lib/midEllipsis'
import { SiteMark } from '../../components/SiteMark'

const SiteList = lazyLoad(() => import('./SiteList').then((m) => ({ default: m.SiteList })))
const warmUp = () => {
  SiteList.preload()
  preloadLayout()
}
/** The list opens whole and in its final order: its chunk is waited for, and the layout (300 ms at most), rather than shown late. */
const LAYOUT_WAIT = 300

const DOT: Record<string, string> = { stopped: 'down', quiet: 'quiet' }

interface SiteMenuProps {
  sites: Site[]
  current: Site | null
  /** No verified install yet: the chip says so, in amber, and shows no dot. */
  unverified?: boolean
  /** The teams' square, before the site, when the build has teams. */
  team?: ReactNode
  onPick: (id: string) => void
  footer: FootItem[]
  find: string
  all: string
}

export function SiteChip({ p }: { p: SiteMenuProps }) {
  const { open, setOpen, attach, close } = useMenu()
  useOnlyOpen('sites', open, close)
  const menu = useRef<HTMLDivElement>(null)
  useTopLayerWhen(open, menu)
  const cur = p.current
  const domains = useDomainControl()
  const picked = cur && domains ? domainLabel(domains) : null
  const state = cur ? dotState(cur) : 'live'
  const toggle = () => {
    if (open) setOpen(false)
    else void Promise.all([layoutReady(LAYOUT_WAIT), SiteList.load()]).then(() => setOpen(true))
  }
  const done = useCallback(() => close(), [close])
  const footer = <MenuFoot items={p.footer} done={done} />
  return (
    <div ref={attach} style={{ position: 'relative' }} className="sitechip">
      {p.team}
      <button type="button" id="siteBtn" className="mk-chip" aria-haspopup="menu" aria-expanded={open} data-key="site" {...warm(warmUp)} onClick={toggle}>
        {cur && (
          <span className="mkwrap">
            <SiteMark site={cur} size={18} />
            {DOT[state] && !p.unverified && <span className={`mk-dot ${DOT[state]}`} />}
          </span>
        )}
        <span className="nmx" title={cur ? cur.name || cur.domain : undefined}>{cur ? midEllipsis(cur.name || cur.domain, 26) : p.all}</span>
        {picked && <span className="dom">{`/ ${picked}`}</span>}
        {cur && p.unverified && <span className="nv">{copy.notVerified}</span>}
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
