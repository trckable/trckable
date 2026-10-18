// Explore as a panel over the page: a sheet from the right (560 px), full width with the section list beside it, or on
// a phone a sheet from the bottom. It is always in the page, off to the side, so opening it is a slide, not a build.
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import './explore.css'
import { MkPortal } from '../ui/Portal'
import { copy } from '../copy'
import { XSkeleton } from '../ui/XBits'
import type { ContentProps } from './PanelContent'
import { keyOf } from './key'
import { askOf, closeExplore, type Ask } from './open'
import { pageDetails } from './pageStore'
import { keepFull, wasFull } from './persist'
import { firstFocusable, usePanelKeys } from './usePanelKeys'
import { QUERY } from '../../kit/breakpoints'

// The content is its own chunk: nothing of it is loaded until Explore is first opened.
const PanelContent = lazy(() => import('./PanelContent'))
const PageDetails = lazy(() => import('./PageDetails'))

// A little longer than the exit glide (explore.css, 180 ms), so the panel is gone from view before it is taken out.
const OUT = 240

const sameAsk = (a: Ask | null, b: Ask | null): boolean => (a === null || b === null ? a === b : a.tab === b.tab && keyOf(a.filters) === keyOf(b.filters))

const wide = () => matchMedia(QUERY['sm-up']).matches

type PanelProps = Omit<ContentProps, 'ask' | 'full' | 'onFull' | 'close'>

/** The panel and what dims the page behind it. */
export function ExplorePanel(p: PanelProps) {
  const { xp, xf, filters } = p.view
  const asked = askOf({ xp, xf, filters })
  // The address's tab and filters, by content: a new object only when they changed.
  const [ask, setAsk] = useState(asked)
  if (!sameAsk(ask, asked)) setAsk(asked)
  const open = ask !== null
  const details = pageDetails.use()
  // What it shows stays until it has slid out; `armed` is the frame after it is built, so the slide in has a start.
  const [shown, setShown] = useState(ask)
  if (ask && ask !== shown) setShown(ask)
  const [armed, setArmed] = useState(false)
  const [full, setFull] = useState(wasFull)
  const box = useRef<HTMLElement>(null)
  const opener = useRef<Element | null>(null)
  useEffect(() => {
    if (open) {
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
  }, [open])
  const on = open && armed
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
    ;(firstFocusable(el) ?? el)?.focus({ preventScroll: true })
  }, [on])
  const toggleFull = () =>
    setFull((f) => {
      const next = wide() ? !f : f
      keepFull(next)
      return next
    })
  usePanelKeys(box, on, toggleFull)
  const fw = full && wide()
  return (
    <MkPortal>
      {!fw && <div className={`xscrim${on ? ' on' : ''}`} id="xscrim" onClick={closeExplore} aria-hidden="true" />}
      <aside ref={box} className={`xp${on ? ' on' : ''}${fw ? ' full' : ''}`} id="xp" aria-label={copy.exploreTab} tabIndex={-1}>
        {shown && (
          <Suspense fallback={<XSkeleton cards={2} label={copy.loading} />}>
            <PanelContent {...p} ask={shown} full={fw} onFull={toggleFull} close={closeExplore} />
          </Suspense>
        )}
      </aside>
      {details !== null && (
        <Suspense fallback={null}>
          <PageDetails site={p.site} range={p.range} view={p.view} />
        </Suspense>
      )}
    </MkPortal>
  )
}
