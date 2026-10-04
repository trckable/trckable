// Under the chart: the note controls (add a note, not for a viewer; open every
// note) as two small chips with an icon each, and, while a day is picked, one
// to go back to the whole period.
import { History, StickyNote, StickyNotePlus, X } from 'lucide-react'
import { copy as notesCopy } from '../notes/copy'
import { copy } from './copy'

interface Props {
  notes?: { count: number; onAdd?: () => void; onOpen: () => void }
  day?: string
  imported?: { from: string; to: string }
  onBack: () => void
}

export function ChartFoot({ notes, day, imported, onBack }: Props) {
  return (
    <div className="note-bar">
      {notes?.onAdd && (
        <button type="button" className="note-chip" onClick={notes.onAdd}>
          <StickyNotePlus size={15} strokeWidth={1.75} aria-hidden="true" />
          {notesCopy.add}
        </button>
      )}
      {notes && (
        <button type="button" className="note-chip" aria-haspopup="dialog" aria-label={notesCopy.openLabel(notes.count)} onClick={notes.onOpen}>
          <StickyNote size={15} strokeWidth={1.75} aria-hidden="true" />
          {notesCopy.list}
          {notes.count > 0 && <b className="num note-count">{notes.count}</b>}
        </button>
      )}
      {imported && (
        <span className="chip imported-chip" title={copy.importedRange(imported.from, imported.to)}>
          <History size={13} strokeWidth={1.75} aria-hidden="true" />
          {copy.imported}
        </span>
      )}
      {day && (
        <button type="button" className="chip scrub-day" onClick={onBack} aria-label={copy.backToPeriod(day)} title={copy.backToPeriod(day)}>
          <span className="num">{day}</span>
          <X size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
