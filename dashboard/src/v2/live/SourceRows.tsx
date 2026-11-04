// Where the people right now came from: the top five, a row each with its share as a bar, how many and the percent.
import { fmtInt } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import { openThing } from '../explore/thing'
import { copy } from './copy'
import type { sourceParts } from './liveModel'

export function SourceRows({ parts, color, timezone, todayVisitors }: { parts: ReturnType<typeof sourceParts>['parts']; color: (channel: string) => string; timezone: string; todayVisitors: number }) {
  if (!parts.length) return <div className="mk-quiet lsq">{copy.noVisitors}</div>
  return (
    <ul className="lsrows">
      {parts.map((p) => (
        <li key={p.channel} title={channelLabel(p.channel)}>
          <button type="button" className="lsn lsn-go" onClick={() => openThing({ kind: 'channel', value: p.channel }, { visit: { at: Date.now(), tz: timezone, todayVisitors } })}>
            <i style={{ background: color(p.channel) }} />
            {channelLabel(p.channel)}
          </button>
          <span className="lsb">
            <u style={{ width: `${Math.max(3, p.grow * 100)}%`, background: color(p.channel) }} />
          </span>
          <b>{fmtInt(p.n)}</b>
          <em>{p.pct}%</em>
        </li>
      ))}
    </ul>
  )
}
