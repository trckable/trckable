// Where the Verified badge leads: trckable.com, or one of the site's open share
// links (no password, no end date passed, no money in it). The choice is kept
// with the widget as a part "link:<id>"; the server falls back to trckable.com
// by itself when that link stops being open.
import { useEffect, useState } from 'react'
import { more, type Share, type WidgetLook } from '../lib/apiMore'
import { badgeLink as copy } from './badgeLinkCopy'

const PREFIX = 'link:'
const open = (s: Share) => !s.has_password && !s.revenue && (!s.expires_at || s.expires_at * 1000 > Date.now())

export function WidgetBadgeLink({ site, look, onLook }: { site: string; look: WidgetLook; onLook: (patch: Partial<WidgetLook>) => void }) {
  const [shares, setShares] = useState<Share[]>([])
  useEffect(() => {
    let live = true
    more.shares(site).then((r) => live && setShares(r.shares.filter(open))).catch(() => {})
    return () => {
      live = false
    }
  }, [site])
  const chosen = look.shows.find((p) => p.startsWith(PREFIX))?.slice(PREFIX.length) ?? ''
  const pick = (id: string) => onLook({ shows: [...look.shows.filter((p) => !p.startsWith(PREFIX)), ...(id ? [PREFIX + id] : [])] })
  return (
    <label className="wg-text">
      <span>{copy.label}</span>
      <select value={shares.some((s) => s.id === chosen) ? chosen : ''} onChange={(e) => pick(e.target.value)}>
        <option value="">{copy.home}</option>
        {shares.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )
}
