// The site in the header, and the list that opens from it (SiteList): every site with who is on it now, a finder, and what
// belongs to this site. The check beside the name says when something independent vouches for the numbers.
import { Suspense, useCallback, useRef, type ReactNode } from 'react'
import type { Site } from '../../lib/api'
import { lazyLoad, warm } from '../../lib/lazyLoad'
import { layoutReady, preloadLayout } from '../../features/sites/useSiteLayout'
import { dotState } from '../../features/sites/StateDot'
import { VerifiedPill } from '../../features/verified/VerifiedPill'
import { useDomainControl } from '../../lib/domainControl'
import { copy } from '../copy'
import { domainLabel } from './DomainRows'
import { useMenu } from './useMenu'
import { useTopLayerWhen } from '../../lib/topLayer'

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
  /** Who is on a site now. */
  online: (id: string) => number
  /** The workspace line at the top, when the account has one. */
  workspace?: { name: string; d: string; run?: () => void }
  onPick: (id: string) => void
  footer: { key: string; label: ReactNode; run: () => void; dot?: 'ok' | 'warn' }[]
  find: string
  all: string
}

export function SiteChip({ p }: { p: SiteMenuProps }) {
  const { open, setOpen, attach, close } = useMenu()
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
  const footer = (
    <div className="mfoot col">
      {p.footer.map((f) => (
        <button key={f.key} type="button" data-stop className="mi" onClick={() => { f.run(); done() }}>
          {f.dot ? (
            <>
              <i className={`pdot${f.dot === 'warn' ? ' warn' : ''}`} />
              <span className="mt2">
                <div className="nm">{f.label}</div>
              </span>
            </>
          ) : (
            f.label
          )}
        </button>
      ))}
    </div>
  )
  return (
    <div ref={attach} style={{ position: 'relative' }} className="sitechip">
      <button type="button" id="siteBtn" className="mk-chip" aria-haspopup="menu" aria-expanded={open} data-key="site" {...warm(warmUp)} onClick={toggle}>
        <span className={`mk-dot ${DOT[state] ?? ''}`} />
        <span className="nmx">{cur ? cur.name || cur.domain : p.all}</span>
        {picked && <span className="dom">{`/ ${picked}`}</span>}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" stroke="var(--mk-muted)" fill="none" strokeWidth="1.5" />
        </svg>
        <span className="mk-kbd">{'S'}</span>
      </button>
      {cur && <VerifiedPill verified={cur.verified} site={cur} seal />}
      <div ref={menu} className={`mk-menu sites${open ? ' on' : ''}`} id="siteMenu" role={open ? 'dialog' : undefined} aria-label={open ? copy.sites : undefined}>
        {open && (
          <Suspense fallback={null}>
            <SiteList
              sites={p.sites}
              current={cur}
              online={p.online}
              workspace={
                p.workspace && (
                  <button type="button" className="mi ws" onClick={() => p.workspace?.run?.()}>
                    <span className="mt2">
                      <div className="nm">{p.workspace.name}</div>
                      <div className="d">{p.workspace.d}</div>
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" fill="none" strokeWidth="1.5" />
                    </svg>
                  </button>
                )
              }
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
