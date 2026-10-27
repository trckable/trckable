// The one picture that fills the lower part of a card: a rising line, the usual's band with the number on it, the sales,
// rows, the signup steps or the outage's day. Which one is the shape's (cardShape.ts).
import { Fragment, type ReactNode } from 'react'
import { fmtInt } from '../../lib/format'
import { place } from '../live/liveModel'
import { Spark } from './KpiCard'
import { copy } from '../briefing/copy'
import { copy as cardCopy } from '../briefing/cards.copy'
import type { Pic } from '../briefing/cardShape'
import type { Story, Vis } from '../briefing/cards'

type Of<K extends Vis['k']> = Extract<Vis, { k: K }>

/** The people-line of the period, rising to the number, bleeding to the card's edges behind its footer. */
function Spike({ vals, bad }: { vals: number[]; bad?: boolean }) {
  if (vals.length < 2) return null
  return (
    <div className={`ic-spk${bad ? ' dn' : ''}`} aria-hidden="true">
      <Spark vals={vals} h={120} className="ic-spkl" />
    </div>
  )
}

/** The usual as a soft band on a line and the number as a lit mark on it, with its figure above. */
export function Band({ v, lo, hi, red, small }: { v: number; lo: number; hi: number; red: boolean; small?: boolean }) {
  const max = Math.max(hi, v, 1) * 1.15
  const now = place(v, max)
  const from = place(lo, max)
  return (
    <div className={`ic-band${small ? ' sm' : ''}${red ? ' dn' : ''}`}>
      <div className="bn" style={{ left: `${Math.min(92, Math.max(8, now))}%` }}>
        {fmtInt(Math.round(v))}
      </div>
      <div className="bt">
        <i className="bu" style={{ left: `${from}%`, width: `${Math.max(1.5, place(hi, max) - from)}%` }} />
        <i className="bm" style={{ left: `${now}%` }} />
      </div>
      <div className="bl">
        <span style={{ left: `${Math.min(from, 55)}%` }}>{cardCopy.goalUsually(`${fmtInt(Math.max(0, Math.round(lo)))}–${fmtInt(Math.round(hi))}`)}</span>
      </div>
    </div>
  )
}

/** The incident's day on a line from 00:00 to now (or the end of the day): "Up" on both sides, the stretch the site did not answer as a red segment of real width, its times under it, and the exact times on hover. */
function Outage({ v }: { v: Of<'outage'> }) {
  return (
    <div className="mk-ob">
      <div className="obt">
        <span className="obu l">{cardCopy.upWord}</span>
        <span className="obu r">{cardCopy.upWord}</span>
        {v.marks.map((x) => (
          <i key={x.a} className="obd" title={`${x.from}–${x.to} · ${cardCopy.downWord(x.min)}`} style={{ left: `${x.a * 100}%`, width: `${(x.b - x.a) * 100}%` }} />
        ))}
        {v.live && <s style={{ left: `${v.nowAt * 100}%` }} />}
      </div>
      <div className="obm">
        {v.marks.map((x) => (
          <span key={x.a} className="num" style={{ left: `${Math.min(88, Math.max(12, ((x.a + x.b) / 2) * 100))}%` }}>
            {cardCopy.downWord(x.min)} · {x.from}–{x.to}
          </span>
        ))}
      </div>
      <div className="obl">
        <span className="num">{v.from}</span>
        <span className="num">{v.live ? `${copy.nowWord} · ${v.now}` : v.now}</span>
      </div>
    </div>
  )
}

/** The signup path as bars, the step that leaks in red with what usually goes on there. */
function Steps({ v }: { v: Of<'funnel'> }) {
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

/** Each goal against its usual: its name, the number and how far from usual, and the band. */
function Goals({ v }: { v: Of<'goals'> }) {
  return (
    <>
      {v.rows.map((g) => (
        <div className={`ic-goal ${g.st}`} key={g.name}>
          <span className="gn">{g.name}</span>
          {g.pct !== null && <span className="gp">{`${g.pct >= 0 ? '↑' : '↓'} ${Math.abs(g.pct)}%`}</span>}
          <Band v={g.v} lo={g.lo} hi={g.hi} red={g.st === 'dn'} small />
        </div>
      ))}
    </>
  )
}

type Row = Of<'rcpt'>['rows'][number]

/** What starts a row: a dot for a sale, the buyer's flag where there is one. */
function Lead({ r, dots }: { r: Row; dots?: boolean }) {
  if (dots) return <i className={`d${r.neg ? ' dn' : ''}`} />
  return r.flag ? <span className="fl">{r.flag}</span> : null
}

/** The most a row's bar can stand for: each row's figure against the biggest of them. */
const share = (rows: Row[], n: number): number => Math.max(4, (n / Math.max(1, ...rows.map((r) => r.n ?? 0))) * 100)

function Rows({ rows, dots }: { rows: Row[]; dots?: boolean }) {
  return (
    <div className="ic-rows">
      {rows.map((r, n) => (
        <div className={`rr${r.more ? ' more' : ''}${r.lead ? ' lead' : ''}`} key={`${n}${r.l}`}>
          <Lead r={r} dots={dots} />
          <span className="rl">
            {r.l}
            {r.t && <small className="mk-rt">{r.t}</small>}
          </span>
          <span className={`ra${r.neg ? ' neg' : ''}`}>{r.a}</span>
          {r.n !== undefined && <span className="rb">
              <u style={{ width: `${share(rows, r.n)}%` }} />
            </span>}
        </div>
      ))}
    </div>
  )
}

const signOf = (neg: boolean, m: number): string => {
  if (neg) return '−'
  return m > 0 ? '+' : ''
}

/** Where the person came from, where they live and what they paid: one strip. */
function Journey({ v }: { v: Of<'journey'> }) {
  return (
    <ol className="ic-jr">
      {v.steps.map((x, n) => (
        <li key={`${n}${x.l}`}>
          <i />
          <b>{x.l}</b>
          {x.t && <small>{x.t}</small>}
        </li>
      ))}
    </ol>
  )
}

/** The sales: the total big, and a clean row for each payment. */
function Money({ s, v }: { s: Story; v: Of<'rcpt'> }) {
  const neg = v.rows.some((r) => r.neg && !r.tot)
  const sign = signOf(neg, s.m)
  return (
    <>
      <div className="ic-big num">{`${sign}${s.val}`}</div>
      <Rows rows={v.rows.filter((r) => !r.tot)} dots />
    </>
  )
}

export function Picture({ s, pic, vals }: { s: Story; pic: Pic; vals: number[] }) {
  const v = s.vis
  if (!v || pic === 'none') return null
  return <div className={`ic-v ${pic}`}>{inner(s, v, pic, vals)}</div>
}

function inner(s: Story, v: Vis, pic: Pic, vals: number[]): ReactNode {
  if (v.k === 'spike') return <Spike vals={vals} bad={s.bad} />
  if (v.k === 'ba') return <Band v={v.v} lo={v.lo} hi={v.hi} red={v.red} />
  if (v.k === 'journey') return <Journey v={v} />
  if (v.k === 'outage') return <Outage v={v} />
  if (v.k === 'funnel') return <Steps v={v} />
  if (v.k === 'goals') return <Goals v={v} />
  return pic === 'money' ? <Money s={s} v={v} /> : <Rows rows={v.rows.filter((r) => !r.tot)} />
}
