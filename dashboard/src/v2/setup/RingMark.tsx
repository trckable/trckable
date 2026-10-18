import { CIRCUMFERENCE, offset } from './model'

/** The setup ring's drawing: an arc for how many steps are done, a tick once all are. Shared by the header and the panel. */
export function RingMark({ done, counted, check }: { done: number; counted: number; check: boolean }) {
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <circle className="rtrack" cx="18" cy="18" r="14" />
      <circle className="rarc" cx="18" cy="18" r="14" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={check ? 0 : offset(done, counted)} transform="rotate(-90 18 18)" />
      {check && <path className="rtick" d="M12 18.5l4 4 8-9" />}
    </svg>
  )
}
