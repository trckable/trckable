// The avatar menu's items (AccountMenu.tsx). Its own chunk, so the first load carries only the button.
import { CircleUser, Keyboard, LogOut } from 'lucide-react'
import { openAccount } from '../lib/account'
import type { Profile } from '../lib/api'
import type { MenuItems } from '../lib/headerMenu'
import { caps, keyFor } from '../lib/keys'
import { isViewer } from '../lib/me'
import { signOut } from '../lib/signOut'
import { THEMES, useTheme } from '../lib/theme'
import { PersonAvatar } from './PersonAvatar'
import { openShortcuts } from './ShortcutsHost'
import { copy } from './itemsCopy'
import './MoreItems.css'
import './sheet.css'

function ThemeRow() {
  const [theme, pick] = useTheme()
  return (
    <div className="menu-theme" role="group" aria-label={copy.theme}>
      <span className="faint">{copy.theme}</span>
      <span className="seg small">
        {THEMES.map((t) => (
          // Radio items, so a menu holds them (a plain button may not sit in one).
          <button key={t} type="button" role="menuitemradio" aria-checked={theme === t} onClick={() => pick(t)}>
            {copy.themes[t]}
          </button>
        ))}
      </span>
    </div>
  )
}

/** Who is signed in: picture, name, email and role. */
function Who({ profile, v }: { profile: Profile | null; v: number }) {
  const viewer = isViewer()
  return (
    <div className="menu-who">
      <PersonAvatar p={profile} v={v} size="big" />
      <span className="menu-who-text">
        <span className="menu-who-name">
          <b>{profile?.name || profile?.email.split('@')[0]}</b>
          <span className={'tag' + (viewer ? ' quiet' : ' on')}>{viewer ? copy.viewer : copy.owner}</span>
        </span>
        <span className="menu-who-email">{profile?.email}</span>
      </span>
    </div>
  )
}

/** The items of the avatar menu. */
export default function AccountItems({ profile, v, go }: { profile: Profile | null; v: number; go: Parameters<MenuItems>[0] }) {
  return (
    <>
      <Who profile={profile} v={v} />
      <button type="button" role="menuitem" aria-label={copy.accountLabel} onClick={go(() => openAccount('sites'))}>
        <CircleUser size={18} strokeWidth={1.75} aria-hidden="true" />
        {copy.account}
      </button>
      <ThemeRow />
      <button type="button" role="menuitem" onClick={go(openShortcuts)}>
        <Keyboard size={18} strokeWidth={1.75} aria-hidden="true" />
        {copy.shortcuts}
        <kbd className="menu-kbd">{caps(keyFor('shortcuts')).join('')}</kbd>
      </button>
      <button type="button" role="menuitem" onClick={go(signOut)}>
        <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
        {copy.signOut}
      </button>
    </>
  )
}
