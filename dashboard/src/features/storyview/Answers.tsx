// "Your five questions, answered", on the card kit with one anatomy (the same as
// a site card): the question and a quiet status on the top line, one big number
// with one chip, the answer as a line, one link, and a chart to the bottom edge.
// The page and the fix draw their own page's or channel's days; the rest draw the site's.
// "What does this mean?" opens a small panel whose button opens Explore with the
// matching filters, so the claim can be checked.
import { Coins, FileText, Gauge, Target, Wrench, type LucideIcon } from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Area, Card, Pill, type Tone as KitTone } from '../../kit'
import { toneColor } from '../../kit/model'
import type { Site } from '../../lib/api'
import { setView } from '../../lib/url'
import { copy } from './copy'
import { HintLine } from './HintLine'
import type { Answer, Hint, Tone } from './rules'

const Explain = lazy(() => import('./Explain'))

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
  series: { visitors: number[]; was?: number[]; revenue?: number[]; own?: Partial<Record<Answer['key'], number[]>> }
  hints?: Hint[]
  onAway: (h: Hint) => void
  /** One more action in an answer's panel, beside its own. */
  askSlot?: (key: Answer['key']) => ReactNode
}

export function Answers({ answers, onConnect, onGoal, site, series, hints = [], onAway, askSlot }: Props) {
  const [open, setOpen] = useState<Answer['key'] | null>(null)
  const go = (a: Answer) => {
    if (!a.act) return
    setView({ v: 'explore', story: a.key, filters: a.act.filters, day: undefined, ...(a.act.compare ? { compare: 'previous' as const } : {}) })
  }
  const chip = (a: Answer) => {
    if (a.delta)
      return (
        <Pill tone={KIT[a.delta.tone]}>
          <span role="img" aria-label={copy.deltaLabel(copy.deltaWord[a.delta.arrow], a.delta.capped ? copy.tenTimes : `${a.delta.pct}%`, a.deltaWhat ?? '')}>
            {copy.deltaText(a.delta.arrow, a.delta.capped ? copy.tenTimesShort : `${a.delta.pct}%`, a.deltaWhat ?? '')}
          </span>
        </Pill>
      )
    return a.chip ? <Pill>{a.chip}</Pill> : null
  }
  /** The one thing to do about an answer, if there is one. */
  const todo = (a: Answer) => {
    if (a.act) return { label: a.act.label, run: () => go(a) }
    if (a.connect && onGoal) return { label: copy.paysCount, run: onGoal }
    return a.connect ? { label: copy.stripe, run: onConnect } : undefined
  }
  const line = (a: Answer) => {
    const at = a.code ? a.line.indexOf(a.code) : -1
    if (!a.code || at < 0) return a.line
    return (
      <>
        {a.line.slice(0, at)}
        <code>{a.code}</code>
        {a.line.slice(at + a.code.length)}
      </>
    )
  }
  const card = (a: Answer) => {
    const Icon = ICON[a.key]
    const tone = toneOfAnswer(a)
    const own = series.own?.[a.key]
    const flat = series.visitors.map(() => 0)
    const lines = a.key === 'pays' && series.revenue && a.chip ? series.revenue : series.visitors
    const drawn = a.key === 'page' || a.key === 'fix' ? (own ?? flat) : lines
    const was = a.key === 'fine' ? series.was : undefined
    return (
      <Card
        key={a.key}
        className={`sv-answer ${a.key} ${a.look}${a.word ? ` ${a.word.tone}` : ''}`}
        label={a.question}
        icon={<Icon size={15} strokeWidth={1.8} />}
        tone={a.key === 'fix' && a.look === 'fix' ? 'warn' : undefined}
        title={a.question}
        chart={drawn.length > 1 && !(a.key === 'fix' && a.look === 'quiet') ? <Area values={drawn} was={was} color={toneColor(tone)} /> : undefined}
      >
        {(a.big || a.delta || a.chip) && (
          <span className="kit-val">
            {a.big && <b className="num sv-big">{a.big}</b>}
            {chip(a)}
          </span>
        )}
        <span className="sv-a-line">{line(a)}</span>
        <button type="button" className="sv-link" aria-expanded={open === a.key} onClick={() => setOpen(open === a.key ? null : a.key)}>
          {copy.what}
        </button>
        {open === a.key && (
          <Suspense fallback={null}>
            <Explain answer={a} todo={todo(a)} slot={askSlot?.(a.key)} />
          </Suspense>
        )}
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
