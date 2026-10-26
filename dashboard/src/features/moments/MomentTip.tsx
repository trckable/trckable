// What a chip says when it is pointed at or focused: its kind and day on a head row, its one line of numbers (with the
// source's own mark) under it, and, when several moments share the chip, the others as a short list.
import { createElement } from 'react'
import { SourceMark } from '../../components/visitor/SourceMark'
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'
import { chipsOf, iconOf } from './kinds'
import type { Mark } from './marks'
import { say } from './words'

/** How many of the others are named; the rest are counted. */
const NAMED = 3

export function MomentTip({ id, mark, money, style }: { id: string; mark: Mark; money: (minor: number) => string; style: React.CSSProperties }) {
  const { pin, more } = mark
  const said = say(pin, money)
  const host = chipsOf(pin).find((c): c is { host: string } => 'host' in c)
  return (
    <div id={id} role="tooltip" className={`moment-tip ${pin.kind}`} style={style}>
      <div className="mt-head">
        {createElement(iconOf(pin.kind), { size: 14, strokeWidth: 2.25, 'aria-hidden': true })}
        <b>{said.title}</b>
        <span className="mt-day num">{fmtDay(pin.day ?? '', { weekday: false })}</span>
      </div>
      <p className="mt-line">
        {host && <SourceMark channel="Referral" referrer={host.host} size={16} />}
        <span>{said.line}</span>
      </p>
      {more.length > 0 && (
        <ul className="mt-more">
          {more.slice(0, NAMED).map((q) => (
            <li key={q.id}>{say(q, money).title}</li>
          ))}
          {more.length > NAMED && <li>{copy.moreMoments(more.length - NAMED)}</li>}
        </ul>
      )}
    </div>
  )
}
