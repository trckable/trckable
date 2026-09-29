// The site switcher in the header. The button is on every page; its list
// (order, pins, groups, search) loads the first time it is wanted, and is
// fetched as soon as the pointer or the keyboard reaches the button, so it
// opens at once without weighing on the first load.
import { ChevronDown } from 'lucide-react'
import { Suspense, useCallback, useEffect, useState } from 'react'
import type { Site } from '../lib/api'
import { useOnlyOpen } from '../lib/headerMenu'
import { copy } from '../features/sites/copy'
import { StateDot } from '../features/sites/StateDot'
import { usePhoneLock } from './lockScroll'
import { SiteMark } from './SiteMark'
import { lazyLoad, warm, whenIdle } from '../lib/lazyLoad'
import { layoutReady, preloadLayout } from '../features/sites/useSiteLayout'

const SiteMenu = lazyLoad(() => import('../features/sites/SiteMenu').then((m) => ({ default: m.SiteMenu })))
const menu = () => {
  SiteMenu.preload()
  preloadLayout()
}
/** The list opens with its final order: the layout is waited for (300 ms at most) rather than shown late. */
const LAYOUT_WAIT = 300

export function SitePicker({ sites, current, all }: { sites: Site[]; current: Site | null; all?: boolean }) {
  const [open, setOpen] = useState(false)
  // Idle fetches only the chunk (the first load keeps its request budget); the layout is asked for once a pointer or focus arrives.
  useEffect(() => whenIdle(SiteMenu.preload), [])
  usePhoneLock(open)
  const close = useCallback(() => setOpen(false), [])
  useOnlyOpen('sites', open, close)
  const name = current?.name || current?.domain || copy.pick
  return (
    <div className="site-pick">
      <button
        type="button"
        className="btn site-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        {...warm(menu)}
        onClick={() => {
          if (open) return setOpen(false)
          void layoutReady(LAYOUT_WAIT).then(() => setOpen(true))
        }}
      >
        {!all && current && (
          <span className="mark-wrap">
            <SiteMark site={current} size={20} />
            <StateDot site={current} />
          </span>
        )}
        <span className="name">{all ? copy.all : name}</span>
        <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <Suspense fallback={null}>
          <SiteMenu sites={sites} current={current} all={!!all} onClose={close} />
        </Suspense>
      )}
    </div>
  )
}
