import { quoteParts } from './pageModel'

/** The sentence that matched, with the words searched for marked. */
export function Quote({ text, words, full }: { text: string; words: string[]; full?: boolean }) {
  const parts = quoteParts(text, words, full ? 4000 : 280)
  return (
    <blockquote className="mp-quote">
      {parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </blockquote>
  )
}
