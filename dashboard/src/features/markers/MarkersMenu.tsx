// Which markers the charts show: one small button beside the replay speed that
// opens the four kinds, each on or off. The same setting serves the main chart
// and the day-by-day chart (settings.ts). On a phone it is the ⋯ button.
import { Layers, MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { copy } from './copy'
import { LAYERS, setLayer, useMarkers } from './settings'
import './markers.css'

export default function MarkersMenu() {
  const on = useMarkers()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btn.current?.focus()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={root} className="markers-menu">
      <button ref={btn} type="button" className="btn speed-btn markers-btn" aria-haspopup="menu" aria-expanded={open} aria-label={copy.menuLabel} title={copy.menuLabel} onClick={() => setOpen((o) => !o)}>
        <Layers size={15} strokeWidth={1.75} aria-hidden="true" className="markers-wide" />
        <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden="true" className="markers-narrow" />
        <span className="speed-name markers-wide">{copy.menu}</span>
      </button>
      {open && (
        <div className="pop menu-pop markers-pop" role="menu" aria-label={copy.menuLabel}>
          <div className="menu-list">
            {LAYERS.map((l) => (
              <button key={l} type="button" role="menuitemcheckbox" aria-checked={on[l]} className={'menu-row markers-row' + (on[l] ? ' on' : '')} onClick={() => setLayer(l, !on[l])}>
                <span className="markers-box" aria-hidden="true" />
                <span className="menu-title">{copy.layers[l]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
