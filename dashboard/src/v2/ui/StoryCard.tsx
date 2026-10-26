// What stood out, as cards: a sentence that says it, the picture that proves it, one line of why, and the buttons.
// A phone sees them as flat rows (icon, sentence, number, arrow) that open the detail. Markup and classes are the
// walkthrough's own.
import type { ReactNode } from 'react'
import { Eye, ArrowUpRight, CircleHelp } from 'lucide-react'
import { isShared } from '../../lib/me'
import type { Verified } from '../../lib/api'
import { CardSeal } from '../../features/verified/SourceChip'
import { Ico } from './icons'
import { Spark } from './KpiCard'
import { copy } from '../briefing/copy'
import { WhyBody } from './WhyBody'
import { useV2Extras } from '../slots'
import { CardMenu, type CardMenuItem } from './CardMenu'
import { copy as cardCopy } from '../briefing/cards.copy'
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
  /** The card's other action, from its ⋯ menu: it does not mark the card done. */
  onExtra: (s: Story) => void
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
  const { askPeekNow } = useV2Extras()
  const w = c.watched(s)
  const dn = c.done(s)
  const inc = s.key === 'uptime'
  const idle = inc ? cardCopy.watchSite : copy.watch
  const watchText = w ? copy.watching : idle
  const watch = !isShared() && (
    <button type="button" className={`${inc ? 'qb' : 'gh'}${w ? ' on' : ''}`} data-watch="1" title={copy.watchTitle} onClick={() => c.onWatch(s)}>
      {inc && <Eye size={14} strokeWidth={1.9} aria-hidden="true" />}
      {watchText}
    </button>
  )
  const extra = s.extra && !isShared() ? [{ key: 'extra', label: s.extra.t, onClick: () => c.onExtra(s), hook: 'data-extra' }] : []
  const watchItem: CardMenuItem[] = isShared() ? [] : [{ key: 'watch', label: w ? copy.watching : copy.watch, onClick: () => c.onWatch(s), hook: 'data-watch' }]
  const act = s.act && !isShared() && (
    <button type="button" className={`xb cact${inc ? ' p' : ''}${dn ? ' done' : ''}`} data-ca="1" onClick={() => c.onAct(s)}>
      {inc && !dn && <ArrowUpRight size={14} strokeWidth={1.9} aria-hidden="true" />}
      {dn ? doneLabel[s.act.k] || copy.doneMark : s.act.t}
    </button>
  )
  // Where there is Peek, "Why?" asks it (the question already sent); without Peek the card says how it knows.
  const peek = s.ask && askPeekNow ? s.ask : null
  const why = { label: peek || s.cause ? copy.whyQ : copy.how, onClick: () => (peek && askPeekNow ? askPeekNow(peek) : c.onHow(s)), hook: peek ? 'data-ask-peek' : 'data-hw' }
  const how = (
    <button type="button" className={inc ? 'qb' : 'gh'} {...{ [why.hook]: '1' }} {...(peek ? {} : { 'aria-expanded': c.how(s) })} onClick={why.onClick}>
      {inc && <CircleHelp size={14} strokeWidth={1.9} aria-hidden="true" />}
      {why.label}
    </button>
  )
  // The incident card leads with its one action, Watch and Why? stay quiet beside it, and there is no way deeper: opening the incident is it.
  if (inc) {
    return (
      <div className="ic-f">
        {act}
        {watch}
        {how}
      </div>
    )
  }
  // Every other card keeps its one action; Why? sits in the ⋯ menu with the rest.
  const items: CardMenuItem[] = [...watchItem, ...extra, { key: 'why', label: why.label, onClick: why.onClick, hook: why.hook }, { key: 'deeper', label: copy.deeper, onClick: () => c.onDeeper(s), hook: 'data-deeper' }]
  return (
    <div className="ic-f">
      {act}
      <CardMenu id={s.key} items={items} />
    </div>
  )
}

/** The line of why, with its one figure in a heavier weight. */
function withBold(text: string, bold?: string): ReactNode {
  const at = bold ? text.indexOf(bold) : -1
  if (!bold || at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <b>{bold}</b>
      {text.slice(at + bold.length)}
    </>
  )
}

/** What else moved in the same group, named under the card, with the way to all of it. */
function Also({ s, c }: { s: Story; c: CardCtx }) {
  if (!s.also?.length) return null
  return (
    <p className="ic-also">
      {cardCopy.alsoChanged(s.also.map((a) => a.name).join(', '))}
      {' · '}
      <button type="button" className="lk3" data-also="1" onClick={() => c.onDeeper({ ...s, deeper: { kind: 'all' } })}>
        {cardCopy.seeAll}
      </button>
    </p>
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
  const cls = `${s.bad && !s.calm ? ' r' : ''}${s.calm ? ' calm' : ''}${wide ? ' wide' : ''}${s.key === 'uptime' ? ' inc' : ''}${c.focused === s.key ? ' kf' : ''}${c.how(s) ? ' open' : ''}`
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
        <Also s={s} c={c} />
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
          {s.lead ? (
            <>
              <b>{s.lead.title}</b> <span className="ic-site">{s.lead.site}</span>
              <span className="ic-when num">{s.lead.when}</span>
            </>
          ) : (
            <>
              <b>{s.head}</b>
              {s.rest}
            </>
          )}
          {s.key === 'search' && <CardSeal verified={c.verified} topic={s.key} />}
        </h3>
        <span className="ic-val">{s.val}</span>
        {CHEV}
      </div>
      <Visual s={s} />
      {/* The goal rows already say the number and its usual, so the card adds no line of its own. */}
      {s.key !== 'goals' && (
        <div className="ic-w">
          <span>{withBold(s.why, s.bold)}</span>
          {s.key !== 'search' && <CardSeal verified={c.verified} topic={s.key} />}
        </div>
      )}
      <Also s={s} c={c} />
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
