// The list of sections beside the numbers when Explore is full width: every section one tap away, the groups named.
import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { XIco } from '../ui/XIcons'
import { copy } from './copy'
import { groups } from './sections'
import type { Connected, Section } from './types'

export function Rail({ section, conn, onPick }: { section: Section; conn: Connected; onPick: (s: Section) => void }) {
  return (
    <nav className="xrail" aria-label={copy.railLabel}>
      {groups().map((g) => (
        <Fragment key={g.key}>
          <div className="xgl">{copy.groups[g.key]}</div>
          {g.items.map((k) => (
            <button key={k} type="button" data-xsec={k} className={`xri${k === section ? ' on' : ''}`} aria-current={k === section ? 'page' : undefined} title={copy.names[k][0]} onClick={() => onPick(k)}>
              <XIco name={k} />
              <span className="nm">{copy.names[k][0]}</span>
              {k === 'sales' && !conn.rev && <span className="xtag">{copy.connectTag}</span>}
            </button>
          ))}
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
