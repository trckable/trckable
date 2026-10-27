// What stood out, as cards: one family. Every card has the same shell: a top row (the kind's icon and what it is about, and
// a badge for how far from usual), one plain sentence with its figure lit, a line of why, one picture that fills the
// lower part, and a foot with the one action and one link deeper. What goes in each is cardShape.ts's to say.
import type { ReactNode } from 'react'
import { SourceChip } from '../../features/verified/SourceChip'
import type { Verified } from '../../lib/api'
import { Ico } from './icons'
import { copy } from '../briefing/copy'
import { WhyBody } from './WhyBody'
import { copy as cardCopy } from '../briefing/cards.copy'
import { sentence, shapeOf } from '../briefing/cardShape'
import { CountUp } from './CountUp'
import { Foot } from './StoryFoot'
import { Picture } from './StoryVisual'
import { VerifiedWith } from './VerifiedWith'
import './storyCard.css'
import './incidentCard.css'
import type { Story } from '../briefing/cards'

export interface CardCtx {
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

/** What else moved in the same group, as small chips, with the way to all of it. */
function Also({ s, c }: { s: Story; c: CardCtx }) {
  if (!s.also?.length) return null
  return (
    <p className="ic-also">
      <span>{cardCopy.alsoLabel}</span>
      {s.also.map((a) => (
        <span className="chip" key={a.name}>
          {a.name}
        </span>
      ))}
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

/** The card's sentence: its figure lit and counting up; the incident says its status, its site and its times instead. */
function Said({ s }: { s: Story }) {
  if (s.lead) {
    return (
      <h3>
        <b>{s.lead.title}</b> <span className="ic-site">{s.lead.site}</span>
        <span className="ic-when num">{s.lead.when}</span>
      </h3>
    )
  }
  const t = sentence(s)
  return (
    <h3>
      {t.before}
      {t.figure && (
        <b className="hl">
          <CountUp text={t.figure} />
        </b>
      )}
      {t.after}
    </h3>
  )
}

export function Card({ s, c }: { s: Story; c: CardCtx }) {
  const sh = shapeOf(s)
  const cls = `${s.bad && !s.calm ? ' r' : ''}${s.calm ? ' calm' : ''}${s.key === 'uptime' ? ' inc' : ''}${c.focused === s.key ? ' kf' : ''}${c.how(s) ? ' open' : ''}${sh.pic === 'spike' ? ' spk' : ''}`
  return (
    <article className={`icard${cls}`} tabIndex={-1} data-topic={s.key}>
      <div className="ic-h">
        <div className="ic-top">
          <Ico name={s.key === 'milestone' ? 'goals' : s.key} className="ic-i" />
          <span className="ic-sub">{sh.subject}</span>
          {s.key === 'search' && <SourceChip verified={c.verified} slot="search" compact />}
          {s.key === 'sales' && <VerifiedWith verified={c.verified} />}
          {sh.badge && <span className={`ic-bd ${sh.badge.tone}`}>{sh.badge.text}</span>}
        </div>
        <Said s={s} />
      </div>
      {sh.why && <p className="ic-w">{withBold(s.why, s.bold)}</p>}
      <Also s={s} c={c} />
      <Picture s={s} pic={sh.pic} vals={c.spark(s)} />
      <Foot s={s} c={c} link={sh.link} />
      <How s={s} />
      {s.key === 'uptime' && c.calm}
    </article>
  )
}

export function CardList({ list, c }: { list: Story[]; c: CardCtx }) {
  return (
    <div className="cards">
      {list.map((s) => (
        <Card key={`${s.key}:${s.head}`} s={s} c={c} />
      ))}
    </div>
  )
}
