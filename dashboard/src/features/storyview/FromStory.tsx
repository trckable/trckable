// Over Explore when it was opened from the story: where it came from, what it
// is narrowed to, and the way back. Its own chunk: only an address that says so loads it.
import { fmtDay } from '../../lib/dates'
import { bar, fromTitle } from './barCopy'

export default function FromStory({ from, range, filters, onBack, onClear }: { from?: string; range: [string, string]; filters: { key: string; dim: string; value: string }[]; onBack: () => void; onClear?: () => void }) {
  const title = fromTitle(from)
  if (!title) return null
  return (
    <div className="sv-from" role="status">
      <span>
        {bar.fromStory}: <b>{title}</b>
      </span>
      <span className="chip">
        {fmtDay(range[0])} {bar.to} {fmtDay(range[1])}
      </span>
      {filters.map((f) => (
        <span key={f.key} className="chip">
          {f.dim}: <b>{f.value}</b>
        </span>
      ))}
      <span className="sv-grow" />
      <button type="button" className="sv-link" onClick={onBack}>
        ← {bar.back}
      </button>
      {onClear && (
        <button type="button" className="sv-link" onClick={onClear}>
          {bar.clear}
        </button>
      )}
    </div>
  )
}
