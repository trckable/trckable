// What stood out, as cards: a sentence that says it, the picture that proves it, one line of why, and the buttons.
// A phone sees them as flat rows (icon, sentence, number, arrow) that open the detail. Markup and classes are the
// walkthrough's own.
import { Fragment, type ReactNode } from 'react'
import { fmtInt } from '../../lib/format'
import { Ico } from './icons'
import { Spark } from './KpiCard'
import { Rng } from './RangeBar'
import { copy } from '../briefing/copy'
import type { Act, Story, Vis } from '../briefing/cards'

const CHEV = <Ico name="chev" className="ic-ch" strokeWidth={1.8} />

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
        <i style={{ left: `${v.a * 100}%`, width: `${Math.max(0.5, (v.b - v.a) * 100)}%` }} />
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
        <span className="gn">{g.name}</span>
        <Rng v={g.v} lo={g.lo} hi={g.hi} max={Math.max(g.v, g.hi, 1) * 1.3} />
        <span className="gv" style={g.st === 'dn' ? { color: 'var(--mk-red)' } : undefined}>
          {fmtInt(g.v)}
        </span>
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

export interface CardCtx {
  /** What is said under "How we know". */
  know: (s: Story) => ReactNode
  onOpen: (s: Story) => void
  onDeeper: (s: Story) => void
  watched: (s: Story) => boolean
  onWatch: (s: Story) => void
  spark: (s: Story) => number[]
  onAct: (s: Story) => void
  done: (s: Story) => boolean
  how: (s: Story) => boolean
  onHow: (s: Story) => void
  /** The card the keyboard is on. */
  focused: string | null
}

const doneLabel: Record<Act['k'], string> = { set: copy.alertSet, copy: copy.copiedDone, goal: copy.goalDone, x: '' }

function Foot({ s, c }: { s: Story; c: CardCtx }) {
  const w = c.watched(s)
  const dn = c.done(s)
  return (
    <div className="ic-f">
      <button type="button" className={`gh${w ? ' on' : ''}`} data-watch="1" title={copy.watchTitle} onClick={() => c.onWatch(s)}>
        {w ? copy.watching : copy.watch}
      </button>
      {s.act && (
        <button type="button" className={`xb cact${dn ? ' done' : ''}`} data-ca="1" onClick={() => c.onAct(s)}>
          {dn ? doneLabel[s.act.k] || copy.doneMark : s.act.t}
        </button>
      )}
      <button type="button" className="gh" data-hw="1" aria-expanded={c.how(s)} onClick={() => c.onHow(s)}>
        {s.cause ? copy.whyQ : copy.how}
      </button>
      <button type="button" className="deep" data-deeper="1" onClick={() => c.onDeeper(s)}>
        {copy.deeper} {'›'}
      </button>
    </div>
  )
}

function How({ s }: { s: Story }) {
  return (
    <div className="hw">
      {s.cause && (
        <>
          <b>{copy.whyDot}</b> {s.cause.cause} <span className="ev">{s.cause.todo}</span>
        </>
      )}
      <b>{copy.how}.</b> {s.how} <span className="ev">{s.ev}</span>
    </div>
  )
}

export function Card({ s, wide, c }: { s: Story; wide: boolean; c: CardCtx }) {
  const cls = `${s.bad ? ' r' : ''}${wide ? ' wide' : ''}${c.focused === s.key ? ' kf' : ''}${c.how(s) ? ' open' : ''}`
  const open = () => c.onOpen(s)
  if (s.kc) {
    return (
      <article className={`icard kc kcty${cls}`} tabIndex={-1} data-topic={s.key} style={{ ['--kcc' as string]: s.kc.tone === 'up' ? '#c6ff3a' : '#ff6b6b' }}>
        <div className="kt" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
          <span className="ki">
            <Ico name="countries" />
          </span>
          <span className="kl">
            {s.kc.flag} {s.kc.label}
          </span>
          <span className={`kn ${s.kc.tone}`}>{s.kc.note}</span>
        </div>
        <div className="kv">
          {s.val}
          <small>{s.u}</small>
        </div>
        <div className="kcw">{s.why}</div>
        <Foot s={s} c={c} />
        <How s={s} />
        <Spark vals={c.spark(s)} h={64} />
      </article>
    )
  }
  return (
    <article className={`icard${cls}`} tabIndex={-1} data-topic={s.key}>
      <div className="ic-h" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
        <Ico name={s.key === 'milestone' ? 'goals' : s.key} className="ic-i" />
        <h3>
          <b>{s.head}</b>
          {s.rest}
        </h3>
        <span className="ic-val">{s.val}</span>
        {CHEV}
      </div>
      <Visual s={s} />
      <div className="ic-w">
        <span>{s.why}</span>
      </div>
      <Foot s={s} c={c} />
      <How s={s} />
    </article>
  )
}

/** The first across both columns, then pairs, and a last one alone across both. */
const wideOf = (i: number, n: number, first: boolean) => (first ? i === 0 || (n % 2 === 0 && i === n - 1) : n % 2 === 1 && i === n - 1)

export function CardList({ list, c, first = true }: { list: Story[]; c: CardCtx; first?: boolean }) {
  return (
    <div className="cards">
      {list.map((s, i) => (
        <Card key={s.key} s={s} c={c} wide={wideOf(i, list.length, first)} />
      ))}
    </div>
  )
}
