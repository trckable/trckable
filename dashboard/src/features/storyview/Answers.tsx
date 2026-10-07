// "Your five questions, answered", on the card kit: Did it work? is a finding,
// Is it good or bad? a verdict, the rest an answer card (What should I fix? in
// its warn look). Each ends in one link that opens Explore with the matching
// filters, so the claim can be checked.
import { ArrowRight, Coins, FileText, Wrench, type LucideIcon } from 'lucide-react'
import { Card, Finding, Verdict } from '../../kit'
import type { Site } from '../../lib/api'
import { setView } from '../../lib/url'
import { copy } from './copy'
import { HintLine } from './HintLine'
import type { Answer, Hint } from './rules'

const ICON: Partial<Record<Answer['key'], LucideIcon>> = { page: FileText, fix: Wrench, pays: Coins }

interface Props {
  answers: Answer[]
  onConnect: () => void
  onGoal?: () => void
  site: Site
  hints?: Hint[]
  onAway: (h: Hint) => void
}

export function Answers({ answers, onConnect, onGoal, site, hints = [], onAway }: Props) {
  const go = (a: Answer) => {
    if (!a.act) return
    setView({ v: 'explore', story: a.key, filters: a.act.filters, day: undefined, ...(a.act.compare ? { compare: 'previous' as const } : {}) })
  }
  const delta = (a: Answer) =>
    a.delta && (
      <span className={`sv-delta ${a.delta.tone}`} role="img" aria-label={copy.deltaLabel(copy.deltaWord[a.delta.arrow], a.delta.pct)}>
        {copy.deltaText(a.delta.arrow, a.delta.pct)}
      </span>
    )
  const links = (a: Answer) => (
    <div className="sv-act">
      {a.act && (
        <button type="button" className="sv-link" onClick={() => go(a)}>
          {a.act.label}
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      )}
      {a.connect && onGoal && !a.act && (
        <button type="button" className="sv-link" onClick={onGoal}>
          {copy.paysCount}
        </button>
      )}
      {a.connect && (
        <button type="button" className="sv-link" onClick={onConnect}>
          {copy.stripe}
        </button>
      )}
    </div>
  )
  const foot = (a: Answer, withLine: boolean) => (
    <>
      {withLine && (
        <b className="sv-a-line">
          {a.line}
          {delta(a)}
        </b>
      )}
      <span className="sv-a-sub">{a.sub}</span>
      {links(a)}
      {hints.filter((h) => h.answer === a.key).map((h) => (
        <HintLine key={h.id} site={site} hint={h} onAway={() => onAway(h)} />
      ))}
    </>
  )
  const card = (a: Answer) => {
    const cls = `sv-answer ${a.key} ${a.look}`
    if (a.key === 'did')
      return (
        <Finding key={a.key} className={cls} tag={a.question} foot={foot(a, false)}>
          {a.line}
          {delta(a)}
        </Finding>
      )
    if (a.key === 'fine' && a.word)
      return <Verdict key={a.key} className={`${cls} ${a.word.tone}`} title={a.question} word={a.word.text} foot={foot(a, true)} />
    const Icon = ICON[a.key]
    const title = (
      <span className="sv-q">
        {Icon && (
          <span className="sv-q-i" aria-hidden="true">
            <Icon size={15} strokeWidth={1.8} />
          </span>
        )}
        {a.question}
      </span>
    )
    return (
      <Card key={a.key} className={cls} variant={a.look === 'fix' ? 'warn' : 'plain'} title={title}>
        {foot(a, true)}
      </Card>
    )
  }
  return (
    <section className="sv-answers" aria-label={copy.questionsTitle}>
      <h2 className="sv-answers-title">{copy.questionsTitle}</h2>
      <div className="sv-cards">{answers.map(card)}</div>
    </section>
  )
}
