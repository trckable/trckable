import { lazy, Suspense, useSyncExternalStore } from 'react'
import type { Page } from './Ghost'

/** The isometric figures: one module, each figure its own lazily loaded file,
    so none of them is in the first load. Every screen uses a figure through
    this component; a new figure is one more entry here (and in `ratios`).
      ghost     the 404: searches three pages with a lamp, the third lights up
      computer  adding a site: types the script tag, then a check
      rack      a site is down: one red LED, unit 04
      logic     verifying: four checks light in turn
      lamp      waiting for the first visit: its beam sweeps the desk */
const Ghost = lazy(() => import('./Ghost'))
const Computer = lazy(() => import('./Computer'))
const Rack = lazy(() => import('./Rack'))
const Logic = lazy(() => import('./Logic'))
const Lamp = lazy(() => import('./Lamp'))

/** Each drawing's width over its height (its viewBox), for the room it keeps. */
const ratios = { ghost: 514.42 / 434.84, computer: 679.4 / 509.5, rack: 631.7 / 473.8, logic: 684.7 / 513.5, lamp: 562.1 / 421.5 }

type Props = { /** Drawn (and loaded) only when the window is at least this wide, in px: a phone skips it. */ minWidth?: number } & (
  | { name: 'ghost'; pages: [Page, Page, Page]; className?: string }
  | { name: 'computer' | 'rack'; className?: string }
  | { name: 'lamp'; className?: string }
  | { name: 'logic'; /** done: every check lit, and a check beside the board. fail: it stops at the second check, lit red. */ state?: 'done' | 'fail'; className?: string }
)

/** Whether the window is at least `px` wide; 0 is always. */
function useWide(px: number): boolean {
  const query = `(min-width: ${px}px)`
  return useSyncExternalStore(
    (on) => {
      const m = matchMedia(query)
      m.addEventListener('change', on)
      return () => m.removeEventListener('change', on)
    },
    () => px <= 0 || (typeof matchMedia === 'function' && matchMedia(query).matches),
    () => px <= 0,
  )
}

export function Figure(props: Props) {
  const { name, className } = props
  const wide = useWide(props.minWidth ?? 0)
  if (!wide) return null
  const state = props.name === 'logic' ? props.state : undefined
  return (
    <div className={className} data-figure={name} data-state={state} aria-hidden={name === 'ghost' ? undefined : true}>
      <Suspense fallback={<div style={{ aspectRatio: ratios[name] }} />}>
        {props.name === 'ghost' && <Ghost pages={props.pages} />}
        {props.name === 'computer' && <Computer />}
        {props.name === 'rack' && <Rack />}
        {props.name === 'logic' && <Logic />}
        {props.name === 'lamp' && <Lamp />}
      </Suspense>
      {state === 'done' && (
        <svg className="tkf-done" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </div>
  )
}
