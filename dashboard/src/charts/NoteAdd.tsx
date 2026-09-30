// The + at the top of the crosshair: a note on the day under the cursor,
// without hunting for a button. It sits beside the tooltip, so moving up to it
// keeps the same day.
import { timeCopy } from './copy'

export function NoteAdd({ x, day, label, onAdd }: { x: number; day: string; label: string; onAdd: (day: string) => void }) {
  return (
    <button
      type="button"
      className="note-add"
      style={{ left: x }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onAdd(day)
      }}
      aria-label={timeCopy.addNoteOn(label)}
      title={timeCopy.addNote}
    >
      +
    </button>
  )
}
