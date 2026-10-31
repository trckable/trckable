// The globe. The canvas draws the land and every pin and does its own hit-testing (engine.ts), so React renders only
// when a pin is picked or hovered, never while the globe spins: the tip and the popover are the only DOM, and the
// engine moves them. Keyboard: Tab to the globe, the arrow keys step through the pins, Enter opens one.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { countryName } from '../../../lib/format'
import { copy } from '../copy'
import { Globe } from './engine'
import { type Pin } from './geo'

export interface Pick {
  key: string
  lat: number
  lon: number
}

const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } as const
const placeOf = (p: Pin) => (p.city ? `${p.city}, ${countryName(p.cc)}` : countryName(p.cc))
/** A marker of several people says how many and where; one person, where and on what. */
const tipText = (p: Pin, crowd: number | null) => {
  const n = crowd ?? p.crowd
  return n > 1 ? copy.crowdTip(n, p.city || countryName(p.cc)) : copy.spotTip(placeOf(p), n, p.path)
}
const nameOf = (p: Pin) => `${p.city || countryName(p.cc)} · ${p.path}`

export function GlobeStage({ pins, people, sel, full, onPick, onCrowd, children }: { pins: Pin[]; people: number; sel: Pick | null; full: boolean; onPick: (key: string) => void; onCrowd: (keys: string[]) => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const globe = useRef<Globe | null>(null)
  const [tip, setTip] = useState<string | null>(null)
  const [tipCrowd, setTipCrowd] = useState<number | null>(null)
  const [kb, setKb] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const latest = useRef({ pins, onPick, onCrowd, full })
  useEffect(() => {
    latest.current = { pins, onPick, onCrowd, full }
  })
  useEffect(() => {
    const el = box.current
    const cv = canvas.current
    if (!el || !cv) return
    const g = new Globe(cv, {
      onPick: (k) => latest.current.onPick(k),
      onCrowd: (ks) => latest.current.onCrowd(ks),
      onHover: (k) => {
        setTip(k)
        setTipCrowd(k ? g.crowdOf(k) : null)
      },
      onSheet: setSheet,
    })
    globe.current = g
    g.setPins(latest.current.pins)
    const size = new ResizeObserver(([e]) => g.resize(e.contentRect.width, e.contentRect.height))
    size.observe(el)
    const seen = new IntersectionObserver(([e]) => g.setOnScreen(e.isIntersecting))
    seen.observe(el)
    const rect = () => el.getBoundingClientRect()
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if ((e.target as Element).closest('.gzoom, .gpop')) return // the buttons and the card are theirs
      g.down(e, rect())
    }
    // The wheel zooms where the pointer is: always in full screen, otherwise only with Ctrl or Cmd held (a trackpad pinch) or once the globe has focus, so the page still scrolls past it.
    const wheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('.gpop')) return
      if (!(latest.current.full || e.ctrlKey || e.metaKey || document.activeElement === el)) return
      e.preventDefault()
      const px = e.deltaMode === 1 ? 33 : 1
      const r = rect()
      g.zoomBy(Math.exp(-e.deltaY * px * (e.ctrlKey ? 0.012 : 0.0018)), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    // The pointer is held only once the press has become a drag, so a tap still reaches the page.
    const move = (e: PointerEvent) => {
      if (g.move(e, rect()) && !el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId)
    }
    const up = (e: PointerEvent) => g.up(e, rect())
    const leave = () => g.move(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: -999, clientY: -999 }), rect())
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', leave)
    return () => {
      size.disconnect()
      seen.disconnect()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('pointerleave', leave)
      g.destroy()
      globe.current = null
    }
  }, [])
  // The people changed: the engine pops, pulses or shrinks the pins itself.
  useEffect(() => globe.current?.setPins(pins), [pins])
  // Leaving full screen puts the zoom back.
  useEffect(() => {
    globe.current?.setFull(full)
    if (!full) globe.current?.zoomTo(1)
  }, [full])
  // A pin is open: the globe stops and eases it to the middle; closed, it spins again after about a second.
  useEffect(() => {
    const g = globe.current
    if (!g) return
    g.mark = sel?.key ?? kb
    g.pop.key = sel?.key ?? null
    if (sel) {
      g.pop.lat = sel.lat
      g.pop.lon = sel.lon
      g.focus(sel.lat, sel.lon)
    }
    g.hold(!!sel)
  }, [sel, kb])
  useEffect(() => {
    if (!globe.current) return
    globe.current.tip.key = tip
    globe.current.wake()
  }, [tip])
  const keys = (e: KeyboardEvent) => {
    const list = pins
    if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      globe.current?.zoomBy(1.5)
      return
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      globe.current?.zoomBy(1 / 1.5)
      return
    }
    if (e.key === '0') {
      globe.current?.zoomTo(1)
      return
    }
    if (!list.length) return
    const at = list.findIndex((p) => p.key === kb)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = list[(at + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]
      setKb(next.key)
      globe.current?.focus(next.lat, next.lon)
    } else if ((e.key === 'Enter' || e.key === ' ') && at >= 0) {
      e.preventDefault()
      if (!globe.current?.activate(list[at].key)) onPick(list[at].key)
    }
  }
  const tipPin = tip && tip !== sel?.key ? pins.find((p) => p.key === tip) : undefined
  const kbPin = kb ? pins.find((p) => p.key === kb) : undefined
  return (
    // The stage is one control for the keyboard: arrows move between pins, Enter opens one.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- a canvas has no native controls
    <div className={`gstage${sheet ? ' gs-sheet' : ''}`} ref={box} role="application" tabIndex={0} aria-label={copy.globeLabel(people)} onKeyDown={keys} onBlur={() => setKb(null)}>
      <canvas ref={canvas} aria-hidden="true" />
      <span style={HIDDEN} aria-live="polite">
        {kbPin ? nameOf(kbPin) : ''}
      </span>
      {tipPin && (
        <div className="gtip" role="tooltip">
          {tipText(tipPin, tipCrowd)}
        </div>
      )}
      {children}
      <div className="gzoom">
        <button type="button" aria-label={copy.zoomIn} title={copy.zoomIn} onClick={() => globe.current?.zoomBy(1.6)}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        <button type="button" aria-label={copy.zoomOut} title={copy.zoomOut} onClick={() => globe.current?.zoomBy(1 / 1.6)}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M3 8h10" />
          </svg>
        </button>
      </div>
    </div>
  )
}
