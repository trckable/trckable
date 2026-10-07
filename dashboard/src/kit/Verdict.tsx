// One word for how it went, a pill with the number behind it, and a line that
// asks the next question.
import type { ReactNode } from 'react'
import { Card } from './Card'
import { kitWords } from './copy'
import { Pill } from './Pill'
import type { Tone } from './model'

/** `foot` sits under the word: a sentence of context. */
export function Verdict({ icon, tone, title, word, pill, ask, onAsk, foot, className = '' }: { icon?: ReactNode; tone?: 'good' | 'warn' | 'bad'; title?: ReactNode; word: ReactNode; pill?: { text: ReactNode; tone?: Tone }; ask?: ReactNode; onAsk?: () => void; foot?: ReactNode; className?: string }) {
  const line = ask && (
    <>
      <span className="kit-ask-i" aria-hidden="true">
        {kitWords.spark}
      </span>
      <span>{ask}</span>
    </>
  )
  return (
    <Card icon={icon} tone={tone} title={title} aside={pill && <Pill tone={pill.tone ?? 'good'}>{pill.text}</Pill>} className={`kit-verdict ${className}`}>
      <b className="kit-word">{word}</b>
      {foot}
      {line &&
        (onAsk ? (
          <button type="button" className="kit-ask" onClick={onAsk}>
            {line}
          </button>
        ) : (
          <span className="kit-ask">{line}</span>
        ))}
    </Card>
  )
}
