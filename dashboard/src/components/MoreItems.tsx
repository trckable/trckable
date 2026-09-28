// The ⋯ menu's items (MoreMenu.tsx). Its own chunk, so the first load carries only the button.
import { CircleUser, Cog, Download, Flag, Keyboard, Maximize2, Minimize2, Plus, RefreshCw } from 'lucide-react'
import { openAccount } from '../lib/account'
import type { MenuItems } from '../lib/headerMenu'
import { caps, keyFor } from '../lib/keys'
import { isShared } from '../lib/me'
import { THEMES, useTheme } from '../lib/theme'
import type { MoreProps } from './MoreMenu'
import { openShortcuts } from './ShortcutsHost'
import { copy } from './moreCopy'
import './MoreItems.css'

/** An item's key, as the shortcuts list shows it. */
function Kbd({ id }: { id: string }) {
  return <kbd className="menu-kbd">{caps(keyFor(id)).join('')}</kbd>
}

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

/** The items of the ⋯ menu. */
export default function MoreItems({ p, go }: { p: MoreProps; go: Parameters<MenuItems>[0] }) {
  return (
    <>
      {!p.live && (
        <button type="button" role="menuitem" onClick={go(p.onRefresh)}>
          <RefreshCw size={18} strokeWidth={1.75} aria-hidden="true" />
          {copy.refresh}
        </button>
      )}
      {!p.live && p.onCreate && (
        <button type="button" role="menuitem" onClick={go(p.onCreate)}>
          <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
          {copy.create}
          <Kbd id="create" />
        </button>
      )}
      {!p.live && <ModeItem full={p.full} go={go(() => p.onMode(p.full ? 'core' : 'full'))} />}
      {p.onSettings && (
        <button type="button" role="menuitem" onClick={go(p.onSettings)}>
          <Cog size={18} strokeWidth={1.75} aria-hidden="true" />
          {copy.settings}
        </button>
      )}
      {!isShared() && (
        <>
          {p.milestones && (
            <button type="button" role="menuitem" onClick={go(p.milestones.open)} aria-label={p.milestones.dot ? copy.milestonesNew : copy.milestones}>
              <Flag size={18} strokeWidth={1.75} aria-hidden="true" />
              {copy.milestones}
              {p.milestones.dot && <span className="more-dot" aria-hidden="true" />}
            </button>
          )}
          <button type="button" role="menuitem" onClick={go(p.onExport)}>
            <Download size={18} strokeWidth={1.75} aria-hidden="true" />
            {copy.export}
          </button>
          <button type="button" role="menuitem" onClick={go(openShortcuts)}>
            <Keyboard size={18} strokeWidth={1.75} aria-hidden="true" />
            {copy.shortcuts}
            <Kbd id="shortcuts" />
          </button>
          <ThemeRow />
          <button type="button" role="menuitem" aria-label={copy.accountLabel} onClick={go(() => openAccount('sites'))}>
            <CircleUser size={18} strokeWidth={1.75} aria-hidden="true" />
            {copy.account}
          </button>
        </>
      )}
    </>
  )
}

function ModeItem({ full, go }: { full: boolean; go: () => void }) {
  const Icon = full ? Minimize2 : Maximize2
  return (
    <button type="button" role="menuitem" onClick={go}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      {full ? copy.core : copy.full}
      <Kbd id="mode" />
    </button>
  )
}
