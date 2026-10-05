// "Your five questions, answered": a card each, as on the landing page's
// features: an icon and the question, the answer in a few words, and one link
// that opens Explore with the matching filters, so the claim can be checked.
import { ArrowRight, Coins, FileText, Scale, TrendingUp, Wrench, type LucideIcon } from 'lucide-react'
import { setView } from '../../lib/url'
import { copy } from './copy'
import type { Answer } from './rules'

const ICON: Record<Answer['key'], LucideIcon> = { did: TrendingUp, page: FileText, fix: Wrench, pays: Coins, fine: Scale }

export function Answers({ answers, onConnect, onGoal }: { answers: Answer[]; onConnect: () => void; onGoal?: () => void }) {
  const go = (a: Answer) => {
    if (!a.act) return
    setView({ v: 'explore', story: a.key, filters: a.act.filters, day: undefined, ...(a.act.compare ? { compare: 'previous' as const } : {}) })
  }
  return (
    <section className="sv-answers" aria-label={copy.questionsTitle}>
      <h2 className="sv-answers-title">{copy.questionsTitle}</h2>
      <div className="sv-cards">
        {answers.map((a) => {
          const Icon = ICON[a.key]
          return (
            <article key={a.key} className={`sv-answer ${a.key} ${a.look}`}>
              <div className="sv-q">
                <span className="sv-q-i" aria-hidden="true">
                  <Icon size={15} strokeWidth={1.8} />
                </span>
                {a.question}
              </div>
              <b className="sv-a-line">{a.line}</b>
              <span className="sv-a-sub">{a.sub}</span>
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
            </article>
          )
        })}
      </div>
    </section>
  )
}
