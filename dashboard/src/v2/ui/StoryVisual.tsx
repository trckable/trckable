// The picture a card proves its sentence with: dots, usual against now as two bars, the timeline of an outage, the signup
// path as bars, the goals against their range, or the receipt of a sale.
import { Fragment, type ReactNode } from 'react'
import { fmtInt } from '../../lib/format'
import { Rng } from './RangeBar'
import { copy } from '../briefing/copy'
import { copy as cardCopy } from '../briefing/cards.copy'
import './goalRows.css'
import type { Story, Vis } from '../briefing/cards'

function Dots({ v }: { v: Extract<Vis, { k: 'dots' }> }) {
  return (
    <div>
      <div className="dots">
        {Array.from({ length: v.n }, (_, i) => (
          <i key={i} style={i >= v.grey ? { background: 'var(--mk-lime)' } : undefined} />
        ))}
      </div>
      <div className="dotn">
        {copy.dotsNote(v.per, v.name)}
        {copy.dotsExtra}.
      </div>
    </div>
  )
}

/** Usual and now as two bars: the usual's band in the first, the number in the second. */
function Ba({ v }: { v: Extract<Vis, { k: 'ba' }> }) {
  const mx = Math.max(v.hi, v.v, 1) * 1.08
  return (
    <div className="ba">
      <div className="mk-bl">
        <span>{copy.usualBar}</span>
        <div className="bt">
          <i style={{ width: `${(v.c / mx) * 100}%` }} />
          <u style={{ left: `${(v.lo / mx) * 100}%`, width: `${Math.max(0.6, ((v.hi - v.lo) / mx) * 100)}%` }} />
        </div>
        <b>
          {fmtInt(v.lo)}–{fmtInt(v.hi)}
        </b>
      </div>
      <div className="mk-bl">
        <span>{copy.nowWord}</span>
        <div className="bt">
          <i className={`f${v.red ? ' red' : ''}`} style={{ width: `${(v.v / mx) * 100}%` }} />
        </div>
        <b>{fmtInt(v.v)}</b>
      </div>
    </div>
  )
}

/** The stretch of the period the site did not answer, on a line from the start to now. */
function Outage({ v }: { v: Extract<Vis, { k: 'outage' }> }) {
  return (
    <div className="mk-ob">
      <div className="obt">
        {v.spans.map((x) => (
          <i key={x.a} style={{ left: `${x.a * 100}%`, width: `${Math.max(0.5, (x.b - x.a) * 100)}%` }} />
        ))}
        <s style={{ left: `${v.nowAt * 100}%` }} />
      </div>
      <div className="obl">
        <span>{v.from}</span>
        <span>
          {copy.nowWord} · {v.now}
        </span>
      </div>
    </div>
  )
}

/** The signup path as bars, the step that leaks in red with what usually goes on there. */
function Steps({ v }: { v: Extract<Vis, { k: 'funnel' }> }) {
  return (
    <div className="mf">
      {v.rows.map((r) => (
        <Fragment key={r.name}>
          {r.hot && <div className="mfd">{r.hot}</div>}
          <div className="mfr">
            <span>{r.name}</span>
            <div className="mb">
              <i className={r.hot ? 'red' : ''} style={{ width: `${r.w}%` }} />
            </div>
            <b>{fmtInt(r.v)}</b>
          </div>
        </Fragment>
      ))}
    </div>
  )
}

export function Visual({ s }: { s: Story }) {
  const v = s.vis
  if (!v) return null
  return <div className="ic-v">{pictureOf(v)}</div>
}

function pictureOf(v: Vis): ReactNode {
  if (v.k === 'dots') return <Dots v={v} />
  if (v.k === 'ba') return <Ba v={v} />
  if (v.k === 'outage') return <Outage v={v} />
  if (v.k === 'funnel') return <Steps v={v} />
  if (v.k === 'goals') {
    return v.rows.map((g) => (
      <div className={`mk-goal ${g.st}`} key={g.name}>
        <span className="gn">
          {g.name}
          <small>{cardCopy.goalUsually(`${fmtInt(Math.max(0, Math.round(g.lo)))}–${fmtInt(Math.round(g.hi))}`)}</small>
        </span>
        <span className="gr">
          <Rng v={g.v} lo={g.lo} hi={g.hi} max={Math.max(g.v, g.hi, 1) * 1.3} />
          <small>{cardCopy.goalUsualTag}</small>
        </span>
        <span className="gv" style={g.st === 'dn' ? { color: 'var(--mk-red)' } : undefined}>
          {fmtInt(Math.round(g.v))}
        </span>
        {g.pct !== null && <span className="gp">{`${g.pct >= 0 ? '↑' : '↓'} ${Math.abs(g.pct)}%`}</span>}
      </div>
    ))
  }
  return (
      <div className="rcpt">
        {v.rows.map((r, n) => (
          <div className={`rr${r.more ? ' more' : ''}${r.tot ? ' tot' : ''}`} key={`${n}${r.l}`}>
            <span className={`fl${r.mark ? ` ${r.mark}m` : ''}`}>{r.flag}</span>
            <span className="rl">{r.l}</span>
            <span className="mk-rt">{r.t}</span>
            <span className={`ra${r.neg ? ' neg' : ''}`}>{r.a}</span>
          </div>
        ))}
      </div>
  )
}
