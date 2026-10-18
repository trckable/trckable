// The small pieces of a row: the site's state in words, how today stands against the usual, the live count, the trend and the ⋯ menu.
import { MoreHorizontal } from 'lucide-react'
import { Popover } from '../../kit'
import { SiteMark } from '../../components/SiteMark'
import { copy as menu } from '../../features/sites/menuCopy'
import { openSiteTab } from '../../features/sites/OpenSite'
import { fmtInt, fmtMoney } from '../../lib/format'
import { isViewer } from '../../lib/me'
import { openSettings, type SettingsTab } from '../../lib/settings'
import { navigate } from '../../lib/url'
import { Spark } from '../AllSitesSpark'
import { copy } from './copy'
import { change, tone, type TeamSite } from './model'

const SPARK = { stopped: 'var(--down)', quiet: 'var(--warn)', new: 'var(--warn)', now: 'var(--accent)', live: 'var(--accent)' }

export const mark = (s: TeamSite) => <SiteMark site={{ domain: s.domain, color: s.color }} size={24} />

export const openSite = (s: TeamSite) => navigate('/' + encodeURIComponent(s.domain))

/** The state in the list's own words: Receiving, quiet 7h, down 23m, Not verified. */
export function Status({ s }: { s: TeamSite }) {
  const word = { stopped: menu.downShort(s.silent), quiet: menu.quietShort(s.silent), new: menu.notVerified, now: copy.receiving, live: copy.receiving }[s.state]
  const kind = { stopped: 'down', quiet: 'warn', new: 'warn', now: 'ok', live: 'ok' }[s.state]
  return <span className={'tm-status ' + kind}>{word}</span>
}

/** Today against the usual: an arrow and percent, amber when lower, green when higher; nothing while there is no usual or the site is down. */
export function Change({ s }: { s: TeamSite }) {
  const c = change(s)
  if (c === null || s.state === 'stopped' || Math.abs(c) < 0.005) return null
  return <span className={'tm-chip ' + tone(c)}>{(c > 0 ? '↑ +' : '↓ −') + fmtInt(Math.abs(c) * 100) + '%'}</span>
}

export function Live({ s }: { s: TeamSite }) {
  if (!s.day || (s.state !== 'now' && s.state !== 'live' && s.state !== 'quiet')) return null
  return (
    <span className={'tm-live' + (s.day.online > 0 ? ' on' : '')}>
      <i aria-hidden="true" />
      {fmtInt(s.day.online)}
    </span>
  )
}

export function Trend({ s, h = 28 }: { s: TeamSite; h?: number }) {
  const v = s.day?.series
  if (!v || v.every((n) => n === 0)) return <span className="tm-flat" style={{ height: h }} aria-hidden="true" />
  return <Spark values={v} color={SPARK[s.state]} h={h} />
}

export const money = (s: TeamSite) => (s.day?.revenue ? fmtMoney(s.day.revenue, s.day.currency, s.day.exponent) : null)

const go = (act: () => void, close: () => void) => {
  close()
  act()
}

/** Site settings, Share, Status page, Widgets, Open. Someone who may only view gets the last two. */
export function SiteMenu({ s }: { s: TeamSite }) {
  const site = { id: s.id, domain: s.domain }
  const item = (label: string, act: () => void, close: () => void) => (
    <button type="button" role="menuitem" className="tm-item" onClick={() => go(act, close)}>
      {label}
    </button>
  )
  const tab = (t: SettingsTab) => () => openSettings(site, t)
  return (
    <Popover
      label={copy.more(s.name)}
      className="menu tm-menu"
      trigger={(p) => (
        <button type="button" className="tm-more" aria-label={copy.more(s.name)} {...p}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <div role="menu">
          {!isViewer() && item(menu.siteSettings, tab('site'), close)}
          {!isViewer() && item(menu.share, tab('sharing'), close)}
          {item(menu.statusPage, () => navigate(`/${encodeURIComponent(s.domain)}/incidents`), close)}
          {!isViewer() && item(menu.widgets, tab('widgets'), close)}
          {item(menu.openSite(s.domain), () => openSiteTab(s.domain), close)}
        </div>
      )}
    </Popover>
  )
}
