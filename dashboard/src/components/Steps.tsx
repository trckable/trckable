// Where you are in a stepped dialog: numbered dots joined by a line, ticked
// once done. One look for every wizard (add a site, two-step, a share link,
// an API key, a payment webhook).
import { Check } from 'lucide-react'
import './Steps.css'

/** at is the current step, counting from 0. done marks a step finished even
 *  when it is the current one (the last one, once it worked). */
export function Steps({ labels, at, done }: { labels: string[]; at: number; done?: number }) {
  return (
    <ol className="wiz-steps" aria-label="Steps">
      {labels.map((label, i) => {
        const state = i < at || i === done ? 'done' : i === at ? 'on' : ''
        return (
          <li key={label} className={state} aria-current={i === at ? 'step' : undefined}>
            <span className="wiz-dot">{state === 'done' ? <Check size={13} strokeWidth={2.5} aria-hidden="true" /> : i + 1}</span>
            <span className="wiz-label">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
