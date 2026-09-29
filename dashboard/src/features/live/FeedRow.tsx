// One person on the site: their generated face with where they came from
// pinned to it, the page they are on, how long ago, and from which country.
// Opening the row opens their journey.
import { ArrowRight } from 'lucide-react'
import { Avatar } from '../../components/visitor/Avatar'
import { DeviceIcon } from '../../components/visitor/DeviceIcon'
import { SourceMark } from '../../components/visitor/SourceMark'
import { countryName, flag } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import { truncateMiddle } from '../../lib/visitor'
import { copy } from './copy'
import type { Row } from './model'
import './FeedRow.css'

/** Someone who did anything this recently gets the pulsing dot. */
export const ACTIVE_MS = 30_000

/** "Search (google.com)": the channel, and the site that sent them. */
function source(v: Row) {
  const channel = channelLabel(v.channel || 'Direct')
  return v.referrer ? `${channel} (${v.referrer})` : channel
}

function Face({ v, active }: { v: Row; active: boolean }) {
  const goal = v.kind === 'goal'
  if (!v.visitor) return <SourceMark channel={v.channel || 'Direct'} referrer={v.referrer} goal={goal} size={34} />
  return (
    <span className="live-face">
      <Avatar id={v.visitor} size={34} live={active} />
      <span className="live-face-src">
        <SourceMark channel={v.channel || 'Direct'} referrer={v.referrer} goal={goal} size={18} />
      </span>
    </span>
  )
}

function pageOf(v: Row) {
  if (v.kind === 'active') return copy.stillHere
  return v.kind === 'goal' ? copy.goal(v.goal ?? '') : (v.path ?? '/')
}

export function FeedRow({ v, clock, leaving, onVisitor }: { v: Row; clock: number; leaving?: boolean; onVisitor?: (visitor: string) => void }) {
  const page = pageOf(v)
  const since = clock - v.last
  const active = since < ACTIVE_MS
  const body = (
    <>
      <Face v={v} active={active} />
      <span className="live-what">
        <span className="live-page num" title={page}>
          {truncateMiddle(page, 40)}
        </span>
        <span className="live-from">
          {v.device && <DeviceIcon device={v.device} size={12} />}
          <span>{copy.from(source(v), v.device ?? '')}</span>
        </span>
      </span>
      <span className="live-side">
        <time className={active ? 'live-ago num active' : 'live-ago num'} aria-label={copy.ago(since)} title={active ? copy.active : undefined}>
          {copy.agoShort(since)}
        </time>
        {v.country && (
          <span className="live-country" title={[v.city, countryName(v.country)].filter(Boolean).join(', ')}>
            <span aria-hidden="true">{flag(v.country)}</span> <span className="live-country-name">{countryName(v.country)}</span>
          </span>
        )}
      </span>
    </>
  )
  const cls = leaving ? 'live-row leaving' : 'live-row'
  const visitor = v.visitor
  if (!onVisitor || !visitor || leaving) return <li className={cls}>{body}</li>
  // A known visitor opens their journey: a real button, so a keyboard reaches it.
  return (
    <li className={cls}>
      <button type="button" className="live-open" onClick={() => onVisitor(visitor)} title={copy.openJourney}>
        {body}
        <span className="live-go" aria-hidden="true">
          <ArrowRight size={14} strokeWidth={2} />
        </span>
      </button>
    </li>
  )
}
