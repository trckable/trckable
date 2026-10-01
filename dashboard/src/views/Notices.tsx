// The notices beside the numbers that are wanted rarely (DashboardParts): a
// failed report, a store still opening after a restart (never a silent wait),
// test payments, and the note that breakdowns are estimates.
type Kind = 'error' | 'warming' | 'test' | 'approx'

export default function Notices({ kind, text, onAct }: { kind: Kind; text?: string; onAct?: () => void }) {
  if (kind === 'error') {
    return (
      <div className="banner" role="alert">
        Couldn't load the report: {text}
      </div>
    )
  }
  if (kind === 'warming') {
    return (
      <div className="banner" role="status">
        <span className="spin" aria-hidden="true" />
        Warming up the analytics store — this happens once after a restart. Visits are still being recorded; the numbers appear in a moment.
      </div>
    )
  }
  if (kind === 'test') {
    return (
      <div className="banner" style={{ borderColor: 'var(--money)' }}>
        <span className="money-dot" />
        Showing <b style={{ color: 'var(--text)' }}>test payments</b> only (sandbox and test-mode purchases).
        <button type="button" className="btn ghost" style={{ height: 30, marginLeft: 'auto' }} onClick={onAct}>
          Back to live revenue
        </button>
      </div>
    )
  }
  return (
    <p className="faint" style={{ fontSize: 12, margin: 0 }}>
      Breakdown visitor counts are estimates (±2%) for ranges above 250,000 sessions. Totals are exact.
    </p>
  )
}
