// One quiet line at the top of Live when the site has more people on it than
// it usually has right now, and a small panel behind "Why?" that says where
// they come from. Nothing shows while it is a normal hour.
import { useEffect, useId, useRef, useState } from 'react'
import type { Busier } from './api'
import { parts, shown } from './busier'
import { copy } from './copy'

export function BusierLine({ busier, timezone }: { busier: Busier | null; timezone: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const id = useId()
  const state = shown(busier)
  // Escape or a click elsewhere closes it.
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('keydown', key)
    document.addEventListener('mousedown', away)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('mousedown', away)
    }
  }, [open])
  if (!busier || !state) return null
  const line = state === 'busier' ? copy.busier(busier.now, busier.usual) : copy.quieter(busier.now, busier.usual)
  return (
    <div className="live-busier" ref={box}>
      <p className="live-busier-line" role="status">
        <span>{line}</span>
        {state === 'busier' && (
          <button type="button" className="live-busier-why" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
            {copy.why} <span aria-hidden="true">→</span>
          </button>
        )}
      </p>
      {open && state === 'busier' && (
        <div className="live-busier-panel card" id={id} role="region" aria-label={copy.whyTitle}>
          <p>{parts(busier, timezone).join(' · ')}</p>
        </div>
      )}
    </div>
  )
}
