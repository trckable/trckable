// Where a card that holds several things is: one dot for each (the one in view
// is longer), and ← → buttons. The words are the caller's.
import { ArrowLeft, ArrowRight } from 'lucide-react'

export interface DeckProps {
  index: number
  count: number
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  /** "1 of 3", in the caller's words, for the dots. */
  position: string
}

export function Deck({ index, count, onPrev, onNext, prevLabel, nextLabel, position }: DeckProps) {
  if (count < 2) return null
  return (
    <>
      <span className="side-dots" role="img" aria-label={position}>
        {Array.from({ length: count }, (_, i) => (
          <i key={i} className={i === index ? 'on' : undefined} />
        ))}
      </span>
      <button type="button" className="btn icon" aria-label={prevLabel} title={prevLabel} disabled={index === 0} onClick={onPrev}>
        <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      <button type="button" className="btn icon" aria-label={nextLabel} title={nextLabel} disabled={index === count - 1} onClick={onNext}>
        <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
      </button>
    </>
  )
}
