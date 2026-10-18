import { STEPS } from './model'
import { copy } from './copy'

/** Progress, said to screen readers only: the setup ring in the header is what shows it. */
export function Dots({ at }: { at: number }) {
  return <div className="sr" role="img" aria-label={copy.progress(at + 1, STEPS.length)} />
}
