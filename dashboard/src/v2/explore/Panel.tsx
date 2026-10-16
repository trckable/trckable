// Explore as a panel over the page: a sheet from the right (560 px), full width with the section list beside it, or on
// a phone a sheet from the bottom. It is always in the page, off to the side, so opening it is a slide, not a build.
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import './explore.css'
import { MkPortal } from '../ui/Portal'
import type { ContentProps } from './PanelContent'
import { copy } from './copy'
import { PageDetails } from './PageDetails'
import { exploreAsk, closeExplore } from './store'
import { usePanelKeys } from './usePanelKeys'

// The content is its own chunk: nothing of it is loaded until Explore is first opened.
const PanelContent = lazy(() => import('./PanelContent'))

const OUT = 340

const wide = () => matchMedia('(min-width:701px)').matches

export type PanelProps = Omit<ContentProps, 'ask' | 'full' | 'onFull' | 'close'>

/** The panel and what dims the page behind it. */
export function ExplorePanel(p: PanelProps) {
  const ask = exploreAsk.use()
  // What it shows stays until it has slid out; `armed` is the frame after it is built, so the slide in has a start.
  const [shown, setShown] = useState(ask)
  if (ask && ask !== shown) setShown(ask)
  const [armed, setArmed] = useState(false)
  const [full, setFull] = useState(false)
  const box = useRef<HTMLElement>(null)
  const opener = useRef<Element | null>(null)
  useEffect(() => {
    if (ask) {
      opener.current = document.activeElement
      const f = requestAnimationFrame(() => setArmed(true))
      return () => cancelAnimationFrame(f)
    }
    const t = setTimeout(() => {
      setArmed(false)
      setShown(null)
    }, OUT)
    const o = opener.current
    if (o instanceof HTMLElement && document.contains(o)) o.focus({ preventScroll: true })
    return () => clearTimeout(t)
  }, [ask])
  const on = ask !== null && armed
  // Nothing behind the panel scrolls while it is there.
  useEffect(() => {
    if (!shown) return
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = ''
    }
  }, [shown])
  useEffect(() => {
    if (!on) return
    const el = box.current
    const first = el?.querySelector<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ;(first ?? el)?.focus({ preventScroll: true })
  }, [on])
  usePanelKeys(box, on, () => setFull((f) => (wide() ? !f : f)))
  const fw = full && wide()
  return (
    <MkPortal>
      {!fw && <div className={`xscrim${on ? ' on' : ''}`} id="xscrim" onClick={closeExplore} aria-hidden="true" />}
      <aside ref={box} className={`xp${on ? ' on' : ''}${fw ? ' full' : ''}`} id="xp" aria-label={copy.title} tabIndex={-1}>
        {shown && (
          <Suspense fallback={null}>
            <PanelContent {...p} ask={shown} full={fw} onFull={() => setFull((f) => !f)} close={closeExplore} />
          </Suspense>
        )}
      </aside>
      <PageDetails site={p.site} range={p.range} view={p.view} />
    </MkPortal>
  )
}
