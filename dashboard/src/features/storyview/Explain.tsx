// The small panel under an answer: what was measured, why it matters, and the
// one thing to do. Lazy (its words are a chunk of their own). `slot` is the place
// for one more action beside the panel's own; nothing fills it here.
import type { ReactNode } from 'react'
import { explainCopy } from './explainCopy'
import type { Answer } from './rules'

export interface ExplainProps {
  answer: Answer
  /** The one thing to do: its label and what it does. */
  todo?: { label: string; run: () => void }
  slot?: ReactNode
}

export default function Explain({ answer, todo, slot }: ExplainProps) {
  return (
    <div className="sv-explain">
      {answer.sub && (
        <p>
          <b>{explainCopy.measured}</b> {answer.sub}
        </p>
      )}
      <p>
        <b>{explainCopy.matters}</b> {explainCopy.why[answer.key]}
      </p>
      {(todo || slot) && (
        <div className="sv-explain-do">
          {todo && (
            <button type="button" className="sv-link" onClick={todo.run}>
              {todo.label}
            </button>
          )}
          {slot}
        </div>
      )}
    </div>
  )
}
