// What stood out, as cards: a sentence that says it, the picture that proves it, one line of why, and the buttons.
// A phone sees them as flat rows (icon, sentence, number, arrow) that open the detail.
import { useState, type ReactNode } from 'react'
import { fmtInt } from '../../lib/format'
import { Ico } from './icons'
import { Spark } from './KpiCard'
import { copy } from '../briefing/copy'
import { dotsOf, type Story } from '../briefing/model'

const ICON = { sources: 'sources', pages: 'pages', countries: 'countries', goals: 'goals', uptime: 'uptime' } as const

/** The picture under a card's sentence. */
export function Visual({ s, usual, who }: { s: Story; usual: number; who: string }) {
  if (s.key === 'sources') {
    const d = dotsOf(Number(s.val.replace(/\D/g, '')) || 0, usual)
    return (
      <div className="ic-v">
        <div>
          <div className="dots">
            {Array.from({ length: d.n }, (_, i) => (
              <i key={i} style={i >= d.grey ? { background: 'var(--mk-lime)' } : undefined} />
            ))}
          </div>
          <div className="dotn">
            {copy.dotsNote(d.per, who)}
            <span style={{ color: 'var(--mk-lime)' }}>{copy.dotsExtra}</span>.
          </div>
        </div>
      </div>
    )
  }
  if (s.rows.length === 0) return null
  return (
    <div className="ic-v">
      <div className="rcpt">
        {s.rows.slice(0, 4).map((r) => (
          <div className="rr" key={r.label}>
            <span className="fl" />
            <span className="rl">{r.label}</span>
            <span className="rt">{r.was === undefined ? copy.newOne : copy.wasN(r.was)}</span>
            <span className="ra">{fmtInt(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export interface CardCtx {
  usual: number
  who: string
  /** What is said under "How we know". */
  know: (s: Story) => ReactNode
  onOpen: (s: Story) => void
  onDeeper: (s: Story) => void
  watched: (s: Story) => boolean
  onWatch: (s: Story) => void
  spark: (s: Story) => number[]
}

function Foot({ s, c, open, onHow }: { s: Story; c: CardCtx; open: boolean; onHow: () => void }) {
  const w = c.watched(s)
  return (
    <div className="ic-f">
      <button type="button" className={`gh${w ? ' on' : ''}`} title={copy.watchTitle} onClick={() => c.onWatch(s)}>
        {w ? copy.watching : copy.watch}
      </button>
      <button type="button" className="gh" aria-expanded={open} onClick={onHow}>
        {copy.how}
      </button>
      <button type="button" className="deep" onClick={() => c.onDeeper(s)}>
        {copy.deeper} {'\u203A'}
      </button>
    </div>
  )
}

export function Card({ s, wide, c }: { s: Story; wide: boolean; c: CardCtx }) {
  const [how, setHow] = useState(false)
  const cls = `icard${s.bad ? ' r' : ''}${wide ? ' wide' : ''}`
  if (s.flag) {
    return (
      <article className={`icard kc kcty${wide ? ' wide' : ''}`} data-story={s.key} tabIndex={-1} style={{ ['--kcc' as string]: 'var(--mk-lime)' }}>
        <div className="kt">
          <span className="ki">
            <Ico name="countries" />
          </span>
          <span className="kl">
            {s.flag} {s.head.replace(/^(First visitors from |)/, '').replace(/ sent .*/, '')}
          </span>
          <span className={`kn${s.note?.up ? ' up' : ''}${s.note?.dn ? ' dn' : ''}`}>{s.note?.t}</span>
        </div>
        <div className="kv">
          {s.val}
          <small>{copy.peopleUnit}</small>
        </div>
        <div className="kcw">{s.why}</div>
        <Foot s={s} c={c} open={how} onHow={() => setHow((h) => !h)} />
        <div className={`hw${how ? ' show' : ''}`}>
          <b>{copy.how}.</b> {c.know(s)}
        </div>
        <Spark vals={c.spark(s)} />
      </article>
    )
  }
  return (
    <article className={cls} data-story={s.key} tabIndex={-1}>
      <div className="ic-h" role="button" tabIndex={0} onClick={() => c.onOpen(s)} onKeyDown={(e) => e.key === 'Enter' && c.onOpen(s)}>
        <Ico name={ICON[s.key]} className="ic-i" />
        <h3>
          <b>{s.head}</b>
          {s.tail ? `, ${s.tail}` : ''}
        </h3>
        <span className="ic-val">{s.val}</span>
        <Ico name="chev" className="ic-ch" strokeWidth={1.8} />
      </div>
      <Visual s={s} usual={c.usual} who={c.who} />
      <div className="ic-w">
        <span>{s.why}</span>
      </div>
      <Foot s={s} c={c} open={how} onHow={() => setHow((h) => !h)} />
      <div className={`hw${how ? ' show' : ''}`}>
        <b>{copy.how}.</b> {c.know(s)}
      </div>
    </article>
  )
}

/** The cards in the walkthrough's grid: the first across both columns, then pairs, and a last one alone across both. */
export function CardList({ list, c }: { list: Story[]; c: CardCtx }) {
  return (
    <div className="cards">
      {list.map((s, i) => (
        <Card key={s.key} s={s} c={c} wide={i === 0 || (list.length > 1 && i === list.length - 1 && (list.length - 1) % 2 === 1)} />
      ))}
    </div>
  )
}
