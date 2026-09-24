// A label on the left, a control on the right. Every settings card is these.
// The label is also published to the controls inside, so a switch or a field
// that has no visible text of its own still has a name to announce.
import { RowLabel } from './Switch'

export function Row({ label, hint, children, tone }: { label: string; hint?: string; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <div className={tone === 'danger' ? 'srow danger' : 'srow'}>
      <div className="srow-text">
        <b>{label}</b>
        {hint && <span className="faint">{hint}</span>}
      </div>
      <div className="srow-ctl">
        <RowLabel.Provider value={label}>{children}</RowLabel.Provider>
      </div>
    </div>
  )
}
