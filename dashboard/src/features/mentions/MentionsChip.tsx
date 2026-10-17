// In the chart's header: "Mentions · N" for the period on screen (nothing at 0). Pointing at it lights the
// markers on the chart; a click opens the Mentions page.
import type { Site } from '../../lib/api'
import { navigate } from '../../lib/url'
import { useNow } from '../incidents/useIncidents'
import { copy } from './copy'
import { setLit } from './lit'
import { periodFor } from './periodFor'
import { SourceMark } from './SourceMark'
import { useMentions } from './useMentions'
import './mentions.css'

export default function MentionsChip({ site, labels, from, to }: { site: Site; labels: string[]; from: string; to: string }) {
  const now = useNow()
  const got = useMentions(site.id, periodFor(labels.length ? labels : [from], now), 0, !!site.mentions)
  if (got.state !== 'ready') return null
  const lo = Date.parse(from) / 1000 - 86400
  const hi = Date.parse(to) / 1000 + 2 * 86400
  const inPeriod = got.data.mentions.filter((m) => m.posted_at >= lo && m.posted_at <= hi)
  if (inPeriod.length === 0) return null
  return (
    <button type="button" className="gh nbtn mp-chip" onPointerEnter={() => setLit(true)} onPointerLeave={() => setLit(false)} onFocus={() => setLit(true)} onBlur={() => setLit(false)} onClick={() => navigate(`/${encodeURIComponent(site.domain)}/mentions`)}>
      <SourceMark source={inPeriod[0].source} />
      {copy.chipCount(inPeriod.length)}
    </button>
  )
}
