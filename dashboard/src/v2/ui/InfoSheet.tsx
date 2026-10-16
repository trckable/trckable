// A short sheet over the page (a drawer on a wide screen, a sheet from the bottom on a phone): a title, what it is
// about, a body and buttons. Notes, the email preview and the like. Escape and the scrim close it.
import { useEffect, useRef, type ReactNode } from 'react'
import { MkPortal } from './Portal'

export function InfoSheet({ title, sub, onClose, children, foot, close, className }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; close: string; className?: string }) {
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    box.current?.focus()
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <MkPortal>
      <div className="xscrim on" onClick={onClose} aria-hidden="true" />
      <aside ref={box} className="cd on" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1}>
        <div className="cdh">
          <b>{title}</b>
          <span className="mk-quiet">{sub}</span>
          <button type="button" className="ib x" title={close} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={`cdb${className ? ` ${className}` : ''}`}>{children}</div>
        {foot && <div className="cdf">{foot}</div>}
      </aside>
    </MkPortal>
  )
}

/** One line of a sheet: what it is, a small line under it, and something on the right. */
export function InfoRow({ t, d, r }: { t: ReactNode; d?: ReactNode; r?: ReactNode }) {
  return (
    <div className="irow">
      <span className="il">
        <b>{t}</b>
        {d && <small>{d}</small>}
      </span>
      <span className="ir">{r}</span>
    </div>
  )
}
