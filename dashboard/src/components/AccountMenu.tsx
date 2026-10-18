// The avatar's menu at the end of the header's first row: what belongs to the
// person, not to the page on screen (that is the ⋯ next to the period):
// Profile, theme, shortcuts, sign out (the rest is in the account window and the ⌘K palette). The items are their own chunk.
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useMenuNav, useOnlyOpen } from '../lib/headerMenu'
import { lazyLoad, warm, whenIdle } from '../lib/lazyLoad'
import { useProfile } from '../lib/profile'
import { AccountDot, type AccountAlert } from './AccountDot'
import { useV2Extras } from '../v2/slots'
import { PersonAvatar } from './PersonAvatar'
import { copy } from './moreCopy'
import { Lifted } from './Lifted'

const AccountItems = lazyLoad(() => import('./AccountItems'))

export function AccountMenu({ alert }: { alert?: AccountAlert | null }) {
  useEffect(() => whenIdle(AccountItems.preload), [])
  const { profile, v } = useProfile()
  // A person whose profile has no name is called what their host calls them.
  const { personName } = useV2Extras()
  const who = profile && !profile.name && personName ? { ...profile, name: personName } : profile
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
        <PersonAvatar p={who} email={personName} v={v} size="small" />
        <AccountDot alert={alert} />
      </button>
      {open && (
        <Lifted className="pop menu more-menu" role="menu" aria-label={copy.accountMenu}>
          <Suspense fallback={null}>
            <AccountItems profile={profile} v={v} go={go} />
          </Suspense>
        </Lifted>
      )}
    </div>
  )
}
