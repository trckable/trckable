// "Your five questions, answered", on the card kit with one anatomy (the same as
// a site card): the question and a quiet status on the top line, one big number
// with one chip, the answer as a line, one link, and a chart to the bottom edge.
// The link opens Explore with the matching filters, so the claim can be checked.
import { ArrowRight, Coins, FileText, Gauge, Target, Wrench, type LucideIcon } from 'lucide-react'
import { Area, Card, Pill, type Tone as KitTone } from '../../kit'
import { toneColor } from '../../kit/model'
import type { Site } from '../../lib/api'
import { setView } from '../../lib/url'
import { copy } from './copy'
import { HintLine } from './HintLine'
import type { Answer, Hint, Tone } from './rules'

const KIT: Record<Tone, KitTone> = { good: 'good', warn: 'warn', bad: 'bad', flat: 'neutral' }

function toneOfAnswer(a: Answer): KitTone {
  if (a.key === 'fix' && a.look === 'fix') return 'warn'
  if (a.word) return KIT[a.word.tone]
  return a.delta ? KIT[a.delta.tone] : 'neutral'
}

const ICON: Record<Answer['key'], LucideIcon> = { did: Target, fine: Gauge, page: FileText, fix: Wrench, pays: Coins }

interface Props {
  answers: Answer[]
  onConnect: () => void
  onGoal?: () => void
  site: Site
  /** The lines the cards draw: visitors, the period before's visitors, and revenue when it is counted. */
  series: { visitors: number[]; was?: number[]; revenue?: number[] }
  hints?: Hint[]
  onAway: (h: Hint) => void
}

export function Answers({ answers, onConnect, onGoal, site, series, hints = [], onAway }: Props) {
  const go = (a: Answer) => {
    if (!a.act) return
    setView({ v: 'explore', story: a.key, filters: a.act.filters, day: undefined, ...(a.act.compare ? { compare: 'previous' as const } : {}) })
  }
  const chip = (a: Answer) => {
    if (a.delta)
      return (
        <Pill tone={KIT[a.delta.tone]}>
          <span role="img" aria-label={copy.deltaLabel(copy.deltaWord[a.delta.arrow], a.delta.pct)}>
            {copy.deltaText(a.delta.arrow, a.delta.pct)}
          </span>
        </Pill>
      )
    return a.chip ? <Pill>{a.chip}</Pill> : null
  }
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
  const card = (a: Answer) => {
    const Icon = ICON[a.key]
    const tone = toneOfAnswer(a)
    const lines = a.key === 'pays' && series.revenue && a.chip ? series.revenue : series.visitors
    const was = a.key === 'fine' ? series.was : undefined
    return (
      <Card
        key={a.key}
        className={`sv-answer ${a.key} ${a.look}${a.word ? ` ${a.word.tone}` : ''}`}
        label={a.question}
        icon={<Icon size={15} strokeWidth={1.8} />}
        tone={a.key === 'fix' && a.look === 'fix' ? 'warn' : undefined}
        title={a.question}
        status={a.status}
        chart={lines.length > 1 ? <Area values={lines} was={was} color={toneColor(tone)} /> : undefined}
      >
        <span className="kit-val">
          <b className="num sv-big">{a.big}</b>
          {chip(a)}
        </span>
        <span className="sv-a-line" title={a.sub}>
          {a.line}
        </span>
        {links(a)}
        {hints.filter((h) => h.answer === a.key).map((h) => (
          <HintLine key={h.id} site={site} hint={h} onAway={() => onAway(h)} />
        ))}
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
