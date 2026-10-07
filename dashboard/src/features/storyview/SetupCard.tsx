// The card at the very top of the story while any of the four first steps is
// open: what is done, what is next, one button straight to it, and Later.
import { Check } from 'lucide-react'
import { useState } from 'react'
import type { Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { nextStep, putOff, setupSteps, setupVisible, type SetupKey } from './setup'
import { setup } from './setupCopy'

export interface SetupCardProps {
  site: Site
  goals: boolean
  /** A payment provider is connected. */
  revenue: boolean
  /** Opens the dialog that counts a sign-up. */
  onGoal?: () => void
}

export function SetupCard({ site, goals, revenue, onGoal }: SetupCardProps) {
  const [off, setOff] = useState(false)
  const steps = setupSteps({ site, goals, revenue })
  const next = nextStep(steps)
  if (!next || off || !setupVisible(site.id)) return null
  const done = steps.filter((s) => s.done).length
  const go = (k: SetupKey) => {
    if (k === 'goal') onGoal?.()
    else openSettings(site, k === 'revenue' ? 'payments' : 'install')
  }
  return (
    <section className="sv-setup" aria-label={setup.title(site.name || site.domain)}>
      <div className="sv-setup-eyebrow">{setup.eyebrow(done)}</div>
      <h2 className="sv-setup-title">{setup.title(site.name || site.domain)}</h2>
      <div className="sv-setup-bar" role="progressbar" aria-label={setup.progress(done)} aria-valuemin={0} aria-valuemax={4} aria-valuenow={done}>
        <span style={{ width: `${(done / 4) * 100}%` }} />
      </div>
      <ul className="sv-setup-steps">
        {steps.map((s) => (
          <li key={s.key} className={s.done ? 'done' : ''}>
            <span className="sv-setup-mark" aria-hidden="true">{s.done && <Check size={12} strokeWidth={3} />}</span>
            {setup.steps[s.key]}
            <span className="sr"> ({s.done ? setup.stepDone : setup.stepOpen})</span>
          </li>
        ))}
      </ul>
      <div className="sv-setup-actions">
        <button type="button" className="btn" onClick={() => { putOff(site.id); setOff(true) }}>
          {setup.later}
        </button>
        <button type="button" className="btn primary" onClick={() => go(next)}>
          {setup.go[next]}
        </button>
      </div>
    </section>
  )
}
