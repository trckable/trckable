// The list of sections beside the numbers when Explore is full width: every section one tap away, the groups named.
import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { XIco } from '../ui/XIcons'
import { copy } from './copy'
import { groups, listedTabs, TABS } from './sections'
import { TAB_ICONS } from './tabIcons'
import type { Connected, Section, Tab } from './types'

export function Rail({ section, tab, conn, onPick, onTab }: { section: Section; tab: Tab; conn: Connected; onPick: (s: Section) => void; onTab: (t: Tab) => void }) {
  return (
    <nav className="xrail" aria-label={copy.railLabel}>
      {groups().map((g) => (
        <Fragment key={g.key}>
          <div className="xgl">{copy.groups[g.key]}</div>
          {g.items.map((k) => {
            const subs = listedTabs(k)
            const on = k === section && !subs.includes(tab)
            return (
              <Fragment key={k}>
                <button type="button" data-xsec={k} className={`xri${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} title={copy.names[k][0]} onClick={() => (subs.length > 0 ? onTab(TABS[k][0]) : onPick(k))}>
                  <XIco name={k} />
                  <span className="nm">{copy.names[k][0]}</span>
                  {k === 'sales' && !conn.rev && <span className="xtag">{copy.connectTag}</span>}
                </button>
                {subs.map((t) => {
                  const Ico = TAB_ICONS[t]
                  return (
                    <button key={t} type="button" data-xtab={t} className={`xri sub${t === tab ? ' on' : ''}`} aria-current={t === tab ? 'page' : undefined} onClick={() => onTab(t)}>
                      {Ico && <Ico className="xi" strokeWidth={1.7} aria-hidden="true" />}
                      <span className="nm">{copy.sub[t]}</span>
                    </button>
                  )
                })}
              </Fragment>
            )
          })}
        </Fragment>
      ))}
    </nav>
  )
}

/** The menu where there is no room beside the numbers: it slides in over them; Esc or a tap beside it closes it. */
export function RailDrawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('.xri.on')?.focus({ preventScroll: true })
    const was = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => {
      document.documentElement.style.overflow = was
      window.removeEventListener('keydown', key)
    }
  }, [onClose])
  // Over the page's own bars, whatever they are stacked in.
  return createPortal(
    <div className="xdrawer">
      <button type="button" className="xdrawer-back" aria-label={copy.close} onClick={onClose} />
      <div className="xdrawer-box" ref={box} role="dialog" aria-modal="true" aria-label={copy.railLabel}>{children}</div>
    </div>,
    document.querySelector('.mk') ?? document.body,
  )
}
