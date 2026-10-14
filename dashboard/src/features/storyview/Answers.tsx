// "Your five questions, answered": each card is a label and a picture, the
// answer drawn rather than written. The words are in the card's tooltip (hover,
// focus or tap on the i): what was measured, why it matters, and one button that
// opens Explore with the matching filters, so the claim can be checked.
import { Coins, FileText, Gauge, Info, Target, Wrench, type LucideIcon } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { Card, Popover } from '../../kit'
import type { Site } from '../../lib/api'
import { setView } from '../../lib/url'
import { copy } from './copy'
import { HintLine } from './HintLine'
import type { Answer, Hint } from './rules'
import { Viz } from './Viz'

const Explain = lazy(() => import('./Explain'))

const ICON: Record<Answer['key'], LucideIcon> = { did: Target, fine: Gauge, page: FileText, fix: Wrench, pays: Coins }

interface Props {
  answers: Answer[]
  onConnect: () => void
  onGoal?: () => void
  site: Site
  hints?: Hint[]
  onAway: (h: Hint) => void
  /** One more action in an answer's tooltip, beside its own. */
  askSlot?: (key: Answer['key']) => ReactNode
}

export function Answers({ answers, onConnect, onGoal, site, hints = [], onAway, askSlot }: Props) {
  const go = (a: Answer) => {
    if (!a.act) return
    setView({ v: 'explore', story: a.key, filters: a.act.filters, day: undefined, ...(a.act.compare ? { compare: 'previous' as const } : {}) })
  }
  /** The one thing to do about an answer, if there is one. */
  const todo = (a: Answer) => {
    if (a.act) return { label: a.act.label, run: () => go(a) }
    if (a.connect && onGoal) return { label: copy.paysCount, run: onGoal }
    return a.connect ? { label: copy.stripe, run: onConnect } : undefined
  }
  const info = (a: Answer) => (
    <Popover
      label={copy.what}
      openOn="hover"
      trigger={(t) => (
        <button {...t} type="button" className="sv-info" aria-label={copy.what} onClick={() => !t['aria-expanded'] && t.onClick()}>
          <Info size={15} />
        </button>
      )}
    >
      {() => (
        <Suspense fallback={null}>
          <Explain answer={a} todo={todo(a)} slot={askSlot?.(a.key)} />
        </Suspense>
      )}
    </Popover>
  )
  const card = (a: Answer) => {
    const Icon = ICON[a.key]
    const empty = a.key === 'pays' && a.viz?.kind === 'sources' && a.viz.rows.length === 0
    return (
      <Card key={a.key} className={`sv-answer ${a.key} ${a.look}`} label={a.question} icon={<Icon size={15} strokeWidth={1.8} />} aside={info(a)} title={a.question}>
        {a.big && <b className="num sv-big">{a.big}</b>}
        {a.viz && <Viz viz={a.viz} />}
        {empty && onGoal && (
          <button type="button" className="sv-link" onClick={onGoal}>
            {copy.paysCount}
          </button>
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
