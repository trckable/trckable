// The avatar menu's items (AccountMenu.tsx). Its own chunk, so the first load carries only the button.
import { useState } from 'react'
import { CircleUser, Eye, EyeOff, Keyboard, LogOut, Smartphone } from 'lucide-react'
import { choose, canLeaveOut, nextChoice, stateOf } from '../features/exclude/ownVisits'
import { openAccount } from '../lib/account'
import type { Profile, Site } from '../lib/api'
import type { MenuItems } from '../lib/headerMenu'
import { install, useWayToInstall } from '../lib/installApp'
import { caps, keyFor } from '../lib/keys'
import { isViewer } from '../lib/me'
import { signOut } from '../lib/signOut'
import { THEMES, useTheme } from '../lib/theme'
import { PersonAvatar } from './PersonAvatar'
import { LanguageList, LanguageRow } from './LanguageItems'
import { openShortcuts } from './ShortcutsHost'
import { toast } from './toastBus'
import { copy as exclude } from '../features/exclude/copy'
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

/** Install the app: the browser's own dialog, or on iOS the way through Share. Only where it can be done. */
function InstallItem({ go }: { go: Parameters<MenuItems>[0] }) {
  const way = useWayToInstall()
  if (!way) return null
  return (
    <button type="button" role="menuitem" title={way === 'ios' ? copy.installHint : undefined} onClick={go(() => (way === 'ios' ? toast(copy.installHint, 'info') : void install()))}>
      <Smartphone size={18} strokeWidth={1.75} aria-hidden="true" />
      {copy.install}
    </button>
  )
}

/** Leave this browser out of the site's counts, or count it again: opens the site, where the tracker keeps the choice. */
function OwnVisits({ site, go }: { site: Site; go: Parameters<MenuItems>[0] }) {
  const next = nextChoice(stateOf(site))
  const Icon = next === 'ignore' ? EyeOff : Eye
  return (
    <button type="button" role="menuitem" onClick={go(() => choose(site, next))}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      {next === 'ignore' ? exclude.leave : exclude.again}
    </button>
  )
}

/** The items of the avatar menu. */
export default function AccountItems({ profile, v, go, site }: { profile: Profile | null; v: number; go: Parameters<MenuItems>[0]; site?: Site }) {
  // The language list takes the menu's place until a choice or Back; Back puts focus on the row again.
  const [listing, setListing] = useState(false)
  const [back, setBack] = useState(false)
  if (listing)
    return (
      <LanguageList
        go={go}
        onBack={() => {
          setBack(true)
          setListing(false)
        }}
      />
    )
  return (
    <>
      <Who profile={profile} v={v} />
      <button type="button" role="menuitem" aria-label={copy.accountLabel} onClick={go(() => openAccount('sites'))}>
        <CircleUser size={18} strokeWidth={1.75} aria-hidden="true" />
        {copy.account}
      </button>
      {site && canLeaveOut(site) && <OwnVisits site={site} go={go} />}
      <ThemeRow />
      <LanguageRow back={back} onOpen={() => setListing(true)} />
      <button type="button" role="menuitem" onClick={go(openShortcuts)}>
        <Keyboard size={18} strokeWidth={1.75} aria-hidden="true" />
        {copy.shortcuts}
        <kbd className="menu-kbd">{caps(keyFor('shortcuts')).join('')}</kbd>
      </button>
      <InstallItem go={go} />
      <button type="button" role="menuitem" onClick={go(signOut)}>
        <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
        {copy.signOut}
      </button>
    </>
  )
}
