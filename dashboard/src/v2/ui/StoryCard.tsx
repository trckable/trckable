// What stood out, as cards: a sentence that says it, the picture that proves it, one line of why, and the buttons.
// A phone sees them as flat rows (icon, sentence, number, arrow) that open the detail. Markup and classes are the
// walkthrough's own.
import type { ReactNode } from 'react'
import { isShared } from '../../lib/me'
import type { Verified } from '../../lib/api'
import { CardSeal } from '../../features/verified/SourceChip'
import { Ico } from './icons'
import { Spark } from './KpiCard'
import { copy } from '../briefing/copy'
import { WhyBody } from './WhyBody'
import './incidentCard.css'
import { Visual } from './StoryVisual'
import type { Act, Story } from '../briefing/cards'

const CHEV = <Ico name="chev" className="ic-ch" strokeWidth={1.8} />

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
  /** The last line of the incident card: what else was normal. */
  calm?: ReactNode
  /** The card the keyboard is on. */
  focused: string | null
  /** What proves the site's numbers: the card that rests on a source says so, in a small mark. */
  verified?: Verified
}

const doneLabel: Record<Act['k'], string> = { set: copy.alertSet, copy: copy.copiedDone, goal: copy.goalDone, x: '' }

function Foot({ s, c }: { s: Story; c: CardCtx }) {
  const w = c.watched(s)
  const dn = c.done(s)
  const watch = !isShared() && (
    <button type="button" className={`gh${w ? ' on' : ''}`} data-watch="1" title={copy.watchTitle} onClick={() => c.onWatch(s)}>
      {w ? copy.watching : copy.watch}
    </button>
  )
  const act = s.act && !isShared() && (
    <button type="button" className={`xb cact${dn ? ' done' : ''}`} data-ca="1" onClick={() => c.onAct(s)}>
      {dn ? doneLabel[s.act.k] || copy.doneMark : s.act.t}
    </button>
  )
  const how = (
    <button type="button" className="gh" data-hw="1" aria-expanded={c.how(s)} onClick={() => c.onHow(s)}>
      {s.cause ? copy.whyQ : copy.how}
    </button>
  )
  // The incident card leads with its one action, Watch and Why? stay quiet beside it, and there is no way deeper: opening the incident is it.
  if (s.key === 'uptime') {
    return (
      <div className="ic-f">
        {act}
        {watch}
        {how}
      </div>
    )
  }
  return (
    <div className="ic-f">
      {watch}
      {act}
      {how}
      <button type="button" className="deep" data-deeper="1" onClick={() => c.onDeeper(s)}>
        {copy.deeper} {'›'}
      </button>
    </div>
  )
}

function How({ s }: { s: Story }) {
  return (
    <div className="hw">
      {s.cause && <WhyBody why={s.cause} />}
      <b>{copy.how}.</b> {s.how} <span className="ev">{s.ev}</span>
    </div>
  )
}

export function Card({ s, wide, c }: { s: Story; wide: boolean; c: CardCtx }) {
  const cls = `${s.bad ? ' r' : ''}${wide ? ' wide' : ''}${s.key === 'uptime' ? ' inc' : ''}${c.focused === s.key ? ' kf' : ''}${c.how(s) ? ' open' : ''}`
  const open = () => c.onOpen(s)
  if (s.kc) {
    return (
      <article className={`icard kc kcty${cls}`} tabIndex={-1} data-topic={s.key} style={{ ['--kcc' as string]: s.kc.tone === 'up' ? 'var(--mk-lime)' : 'var(--mk-red)' }}>
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
        <CardSeal verified={c.verified} topic={s.key} />
      </div>
      <Foot s={s} c={c} />
      <How s={s} />
      {s.key === 'uptime' && c.calm}
    </article>
  )
}

/** The first across both columns, then pairs, and a last one alone across both. */
const wideOf = (i: number, n: number, first: boolean) => (first ? i === 0 || (n % 2 === 0 && i === n - 1) : n % 2 === 1 && i === n - 1)

export function CardList({ list, c, first = true }: { list: Story[]; c: CardCtx; first?: boolean }) {
  return (
    <div className="cards">
      {list.map((s, i) => (
        <Card key={`${s.key}:${s.head}`} s={s} c={c} wide={wideOf(i, list.length, first)} />
      ))}
    </div>
  )
}
