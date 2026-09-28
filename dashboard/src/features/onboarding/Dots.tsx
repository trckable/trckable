import { STEPS } from './model'
import { copy } from './copy'

/** Progress as three dots; the words are for screen readers. */
export function Dots({ at }: { at: number }) {
  return (
    <div className="ob-dots" role="img" aria-label={copy.progress(at + 1, STEPS.length)}>
      {STEPS.map((s, i) => (
        <i key={s} className={i <= at ? 'on' : undefined} aria-hidden="true" />
      ))}
    </div>
  )
}
