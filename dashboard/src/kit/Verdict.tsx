// One word for how it went, a pill with the number behind it, and a line that
// asks the next question.
import type { ReactNode } from 'react'
import { Card } from './Card'
import { kitWords } from './copy'
import { Pill } from './Pill'
import type { Tone } from './model'

export function Verdict({ title, word, pill, ask, onAsk }: { title?: ReactNode; word: ReactNode; pill?: { text: ReactNode; tone?: Tone }; ask?: ReactNode; onAsk?: () => void }) {
  const line = ask && (
    <>
      <span className="kit-ask-i" aria-hidden="true">
        {kitWords.spark}
      </span>
      <span>{ask}</span>
    </>
  )
  return (
    <Card title={title} aside={pill && <Pill tone={pill.tone ?? 'good'}>{pill.text}</Pill>} className="kit-verdict">
      <b className="kit-word">{word}</b>
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
