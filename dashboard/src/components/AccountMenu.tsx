// The avatar's menu at the end of the header's first row: what belongs to the
// person, not to the page on screen (that is the ⋯ next to the period):
// Profile, theme, shortcuts, sign out. The items are their own chunk.
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { Site } from '../lib/api'
import { useMenuNav, useOnlyOpen } from '../lib/headerMenu'
import { lazyLoad, warm, whenIdle } from '../lib/lazyLoad'
import { useProfile } from '../lib/profile'
import { PersonAvatar } from './PersonAvatar'
import { copy } from './moreCopy'

const load = () => import('./AccountItems')
const AccountItems = lazyLoad(load)

/** Open the Features pop-up from anywhere. It lives in the menu's chunk (which the first load already knows how to fetch), and fetches its own. */
export const openFeatures = () => void load().then((m) => m.showFeatures())

export function AccountMenu({ site }: { site?: Site }) {
  useEffect(() => whenIdle(AccountItems.preload), [])
  const { profile, v } = useProfile()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useOnlyOpen('account', open, close)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  useMenuNav(open, root, button, close)
  // Focus goes back to the avatar before the choice runs, so a dialog that it
  // opens hands focus back there when it closes.
  const go = (fn: () => void) => () => {
    setOpen(false)
    button.current?.focus()
    fn()
  }
  return (
    <div ref={root} className="more account-menu">
      <button ref={button} type="button" className="btn icon ghost account-btn" data-key="user" aria-haspopup="menu" aria-expanded={open} aria-label={copy.accountMenu} title={copy.accountMenu} {...warm(AccountItems.preload)} onClick={() => setOpen((o) => !o)}>
        <PersonAvatar p={profile} v={v} size="small" />
      </button>
      {open && (
        <div className="pop menu more-menu" role="menu" aria-label={copy.accountMenu}>
          <Suspense fallback={null}>
            <AccountItems profile={profile} v={v} go={go} site={site} />
          </Suspense>
        </div>
      )}
    </div>
  )
}
