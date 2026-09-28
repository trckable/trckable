// Under the chart: add a note (not for a viewer), or open every note. Two small chips with an
// icon each, the count as a badge, so they read as the chart's own controls.
import { StickyNote, StickyNotePlus } from 'lucide-react'
import { copy } from './copy'

export function NoteBar({ count, onAdd, onOpen }: { count: number; onAdd?: () => void; onOpen: () => void }) {
  return (
    <div className="note-bar">
      {onAdd && (
        <button type="button" className="note-chip" onClick={onAdd}>
          <StickyNotePlus size={15} strokeWidth={1.75} aria-hidden="true" />
          {copy.add}
        </button>
      )}
      <button type="button" className="note-chip" aria-haspopup="dialog" aria-label={copy.openLabel(count)} onClick={onOpen}>
        <StickyNote size={15} strokeWidth={1.75} aria-hidden="true" />
        {copy.list}
        {count > 0 && <b className="num note-count">{count}</b>}
      </button>
    </div>
  )
}
