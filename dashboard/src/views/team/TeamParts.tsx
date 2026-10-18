// The small pieces both layouts share: a site's status, how today stands against the usual, the live count and the ⋯ menu.
import { MoreHorizontal, ExternalLink, Settings, Share2 } from 'lucide-react'
import { Popover } from '../../kit'
import { SiteMark } from '../../components/SiteMark'
import { fmtInt, fmtMoney } from '../../lib/format'
import { openSettings } from '../../lib/settings'
import { navigate } from '../../lib/url'
import { Spark } from '../AllSitesSpark'
import { copy } from './copy'
import { change, tone, type TeamSite } from './model'

const SPARK = { down: 'var(--down)', quiet: 'var(--warn)', unverified: 'var(--warn)', new: 'var(--accent)', ok: 'var(--accent)' }

export const mark = (s: TeamSite) => <SiteMark site={{ domain: s.name, color: s.color }} size={24} />

/** Down, quiet, not verified or waiting; nothing for a site that is fine. */
export function Status({ s }: { s: TeamSite }) {
  if (s.status === 'ok') return null
  return <span className={'tm-status ' + s.status}>{copy.rowStatus(copy.status[s.status], s.note)}</span>
}

/** Today against the usual: an arrow and percent, amber when lower, green when higher. */
export function Change({ s }: { s: TeamSite }) {
  const c = change(s)
  if (c === null || s.status === 'down' || Math.abs(c) < 0.005) return null
  return <span className={'tm-chip ' + tone(c)}>{(c > 0 ? '↑ +' : '↓ −') + fmtInt(Math.abs(c) * 100) + '%'}</span>
}

export function Live({ s }: { s: TeamSite }) {
  return (
    <span className={'tm-live' + (s.online > 0 ? ' on' : '')}>
      <i aria-hidden="true" />
      {fmtInt(s.online)}
    </span>
  )
}

export function Trend({ s, h = 36 }: { s: TeamSite; h?: number }) {
  if (!s.series || s.series.every((v) => v === 0)) return <span className="tm-flat" style={{ height: h }} aria-hidden="true" />
  const color = SPARK[s.status]
  return <Spark values={s.series} color={color} h={h} />
}

export const money = (s: TeamSite) => (s.revenue ? fmtMoney(s.revenue, s.currency, s.exponent) : null)

function go(act: () => void, close: () => void) {
  close()
  act()
}

/** Open, Settings, Share. */
export function SiteMenu({ s }: { s: TeamSite }) {
  const site = { id: s.id, domain: s.name }
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
          <button type="button" role="menuitem" className="tm-item" onClick={() => go(() => navigate('/' + encodeURIComponent(s.name)), close)}>
            <ExternalLink size={15} aria-hidden="true" />
            {copy.open}
          </button>
          <button type="button" role="menuitem" className="tm-item" onClick={() => go(() => openSettings(site, 'site'), close)}>
            <Settings size={15} aria-hidden="true" />
            {copy.settings}
          </button>
          <button type="button" role="menuitem" className="tm-item" onClick={() => go(() => openSettings(site, 'sharing'), close)}>
            <Share2 size={15} aria-hidden="true" />
            {copy.share}
          </button>
        </div>
      )}
    </Popover>
  )
}
