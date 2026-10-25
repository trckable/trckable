import { copy } from './copy'
import { STEPS } from './model'

/** The three steps of the first run, in a row: done, current, next. */
const stateOf = (i: number, at: number) => {
  if (i < at) return 'done'
  return i === at ? 'now' : undefined
}

export function Steps({ at }: { at: number }) {
  const names = [copy.steps.site, copy.steps.code, copy.steps.visit]
  return (
    <ol className="ob-steps" aria-label={copy.steps.label}>
      {STEPS.map((step, i) => (
        <li key={step} className={stateOf(i, at)} aria-current={i === at ? 'step' : undefined}>
          <span className="ob-step-n" aria-hidden="true">
            {i + 1}
          </span>
          <span className="ob-step-name">{names[i]}</span>
        </li>
      ))}
    </ol>
  )
}
