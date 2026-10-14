// On Live, while a mention is sending people right now: "From Hacker News now".
// Nothing shows otherwise. Asked about once a minute, like the busy-moment line.
import { fmtInt } from '../../lib/format'
import { copy } from './copy'
import { SourceMark } from './SourceMark'
import { useMentions } from './useMentions'
import './mentions.css'

export default function MentionChip({ site }: { site: string }) {
  const got = useMentions(site, '7d', 60_000)
  if (got.state !== 'ready' || !got.data.driving) return null
  const m = got.data.driving
  return (
    <p className="mention-chip" role="status">
      <SourceMark source={m.source} />
      <span>{copy.chip(copy.name[m.source])}</span>
      <strong>{fmtInt(m.visitors)}</strong>
    </p>
  )
}
