// A lazy component that can be fetched before it is needed. The first load
// carries only the button; the menu or dialog behind it is its own chunk,
// asked for when the browser is idle after the page is up, or when a pointer
// or focus reaches the button — whichever comes first. By the time anyone
// clicks, it is there: no spinner, no flash, nothing slower.
//
// Once the chunk is here the component renders straight away instead of
// through React.lazy: lazy() suspends on its first render even for code that
// already arrived, and React holds a suspended reveal back by ~300 ms, which
// made every first open of a dialog feel slow.
import { createElement, lazy, useState, type ComponentProps, type ComponentType } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same bound React's own lazy() uses
export function lazyLoad<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  let once: Promise<{ default: T }> | null = null
  let ready: T | null = null
  const get = () =>
    (once ??= load().then((m) => {
      ready = m.default
      return m
    }))
  const Lazy = lazy(get)
  function Loaded(props: ComponentProps<T>) {
    // Chosen once per mount: swapping the component later would remount it.
    const [Ready] = useState(() => ready)
    return createElement(Ready ?? Lazy, props)
  }
  const preload = () => {
    void get().catch(() => {
      once = null // a failed download may be tried again
    })
  }
  return Object.assign(Loaded, { preload })
}

/** Runs `fn` once the page has loaded (a chunk fetched earlier would hold the load event back) and the browser has nothing better to do. */
export function whenIdle(fn: () => void) {
  if (typeof document === 'undefined') return
  const idle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(() => fn(), { timeout: 3000 }) : setTimeout(fn, 1500))
  if (document.readyState === 'complete') idle()
  else window.addEventListener('load', idle, { once: true })
}

/** Props for a button whose menu is a lazyLoad chunk: pointing, focusing or touching fetches it. */
export const warm = (preload: () => void) => ({ onPointerEnter: preload, onFocus: preload, onPointerDown: preload, onTouchStart: preload })
