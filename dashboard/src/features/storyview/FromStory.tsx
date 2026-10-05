// Over Explore when it was opened from the story: where it came from and the
// way back. What it is narrowed to is the filter row's chips, just above. It rides with the host chunk.
import { bar, fromTitle } from './barCopy'

export default function FromStory({ from, onBack, onClear }: { from?: string; onBack: () => void; onClear?: () => void }) {
  const title = fromTitle(from)
  if (!title) return null
  return (
    <div className="sv-from" role="status">
      <span>
        {bar.fromStory}: <b>{title}</b>
      </span>
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
