// The top of a setup wizard: one bar part per step, the ones reached filled,
// and "Step N of M" beside them. The words come from the caller.
import './Stepper.css'

export function Stepper({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div className="stepper">
      <div className="stepper-bars" role="progressbar" aria-label={label} aria-valuemin={1} aria-valuemax={total} aria-valuenow={step}>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < step ? 'on' : undefined} />
        ))}
      </div>
      <span className="stepper-label">{label}</span>
    </div>
  )
}
