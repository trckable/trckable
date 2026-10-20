import { useState } from 'react'
import { dateFmt, fmtFixed } from '../../lib/format'
import { tag } from '../../i18n'
import { duration, isDown, lasted } from '../incidents/model'
import { copy } from './copy'
import { Frame } from './Frame'
import type { IncidentsBlock } from './types'

const when = (unix: number) => dateFmt(tag ?? 'en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(unix * 1000))

/** The incidents of a period, oldest first, with how long each lasted and the share of the period the site was up. */
export function IncidentTimeline({ b, now: at }: { b: IncidentsBlock; now?: number }) {
  const [seen] = useState(() => Date.now() / 1000)
  const now = at ?? seen
  const { incidents, uptime } = b.data
  return (
    <Frame title={b.title} period={b.period} explore={b.explore}>
      {uptime !== null && <p className="blk-sub">{copy.uptime(`${fmtFixed(uptime, 1)}%`)}</p>}
      {incidents.length === 0 ? (
        <p className="blk-sub">{copy.noIncidents}</p>
      ) : (
        <ol className="blk-inc">
          {[...incidents]
            .sort((a, c) => a.started_at - c.started_at)
            .map((x) => (
              <li key={x.id} data-kind={x.kind}>
                <i aria-hidden="true" />
                <span>
                  <b>{isDown(x) ? copy.down : copy.quiet}</b> {copy.lasted(duration(lasted(x, now)))}
                  {x.ended_at === null && <em>{copy.ongoing}</em>}
                </span>
                <time>{when(x.started_at)}</time>
                {x.cause && <small>{x.cause}</small>}
              </li>
            ))}
        </ol>
      )}
    </Frame>
  )
}
