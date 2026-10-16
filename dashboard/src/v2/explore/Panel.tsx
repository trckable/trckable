// Explore's shell: a panel from the right over the page (a sheet from the bottom on a phone) with its own scrim,
// a header with the site and the period, the way to full width, and the way out. At full width the sections are a
// rail beside the table. Escape closes the top layer.
import { useEffect, useState, type ReactNode } from 'react'
import { MkPortal } from '../ui/Portal'
import { copy } from './copy'

const WIDEN = 'M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9'
const NARROW = 'M13 6.5h-3.5v-3.5M3 9.5h3.5v3.5M9.5 6.5 14 2M6.5 9.5 2 14'

export function Panel({ sub, full, collapsed, canFull, rail, onFull, onClose, hasMenu, onShutMenu, children }: { sub: string; full: boolean; collapsed: boolean; canFull: boolean; rail: ReactNode; onFull: () => void; onClose: () => void; hasMenu: boolean; onShutMenu: () => void; children: ReactNode }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true))
    document.documentElement.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(id)
      document.documentElement.style.overflow = ''
    }
  }, [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        if (hasMenu) onShutMenu()
        else onClose()
        return
      }
      const tg = (e.target as HTMLElement).tagName
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && tg !== 'INPUT' && tg !== 'SELECT' && tg !== 'TEXTAREA' && canFull) {
        e.preventDefault()
        onFull()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [hasMenu, onShutMenu, onClose, onFull, canFull])
  const wide = full && canFull
  return (
    <MkPortal>
      <div className={`xscrim${on ? ' on' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`xp${on ? ' on' : ''}${wide ? ' full' : ''}`} aria-label={copy.title}>
        <div className="xph">
          <b>{copy.title}</b>
          <span className="mk-quiet">{sub}</span>
          {canFull && (
            <button type="button" className="ib xfull" title={wide ? copy.sidePanel : copy.fullWidth} aria-label={wide ? copy.sidePanel : copy.fullWidth} aria-pressed={wide} onClick={onFull}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={wide ? NARROW : WIDEN} />
              </svg>
            </button>
          )}
          <button type="button" className="ib x" title={copy.close} onClick={onClose}>
            &times;
          </button>
        </div>
        <div id="xpBody">{wide ? <div className={`xlay${collapsed ? ' rc' : ''}`}>{rail}<div className="xmain">{children}</div></div> : children}</div>
      </aside>
    </MkPortal>
  )
}
