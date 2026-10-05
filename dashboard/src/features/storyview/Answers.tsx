// "Your five questions, answered": a plain answer each and one button that
// opens Explore with the matching filters, so the story's claim can be checked.
import { setView } from '../../lib/url'
import { copy } from './copy'
import type { Answer } from './rules'

/** Which button is set apart: the first answer's, and the fix. */
const BUTTON: Partial<Record<Answer['key'], string>> = { did: 'main', fix: 'fix' }

export function Answers({ answers, onConnect, onGoal }: { answers: Answer[]; onConnect: () => void; onGoal?: () => void }) {
  const go = (a: Answer) => {
    if (!a.act) return
    setView({ v: 'explore', story: a.key, filters: a.act.filters, day: undefined, ...(a.act.compare ? { compare: 'previous' as const } : {}) })
  }
  return (
    <section className="sv-answers" aria-label={copy.questionsTitle}>
      <h2 className="sv-answers-title">{copy.questionsTitle}</h2>
      {answers.map((a) => (
        <div key={a.key} className={`sv-answer ${a.look}`}>
          <div className="sv-q">{a.question}</div>
          <div className="sv-a">
            <b className="sv-a-line">{a.line}</b>
            <span className="sv-a-sub">{a.sub}</span>
          </div>
          <div className="sv-act">
            {a.act && (
              <button type="button" className={`sv-btn ${BUTTON[a.key] ?? ''}`.trim()} onClick={() => go(a)}>
                {a.act.label}
              </button>
            )}
            {a.connect && onGoal && !a.act && (
              <button type="button" className="sv-btn" onClick={onGoal}>
                {copy.paysCount}
              </button>
            )}
            {a.connect && (
              <button type="button" className="sv-btn" onClick={onConnect}>
                {copy.stripe}
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}
