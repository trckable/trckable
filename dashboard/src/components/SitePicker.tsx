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
import { lazyLoad, whenIdle } from '../lib/lazyLoad'

const SiteMenu = lazyLoad(() => import('../features/sites/SiteMenu').then((m) => ({ default: m.SiteMenu })))
const menu = SiteMenu.preload

export function SitePicker({ sites, current, all }: { sites: Site[]; current: Site | null; all?: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => whenIdle(menu), [])
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
        onPointerEnter={menu}
        onFocus={menu}
        onClick={() => setOpen((o) => !o)}
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
