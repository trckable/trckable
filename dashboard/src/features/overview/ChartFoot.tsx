// Under the chart: quiet text buttons with a small icon each. Start the period
// at the first visit, add a note (not for a viewer), open every note, and
// while a day is picked, one to go back to the whole period.
import { Calendar, Flag, Plus, X } from 'lucide-react'
import { copy as notesCopy } from '../notes/copy'
import { copy } from './copy'

interface Props {
  since?: string
  onShowSince?: () => void
  notes?: { count: number; onAdd?: () => void; onOpen: () => void }
  day?: string
  onBack: () => void
}

const icon = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const

export function ChartFoot({ since, onShowSince, notes, day, onBack }: Props) {
  return (
    <div className="chart-foot">
      {since && onShowSince && (
        <button type="button" className="tbtn" onClick={onShowSince} title={copy.showSinceTitle(since)}>
          <Calendar {...icon} />
          {copy.showSince(since)}
        </button>
      )}
      {notes?.onAdd && (
        <button type="button" className="tbtn" onClick={notes.onAdd}>
          <Plus {...icon} />
          {notesCopy.add}
        </button>
      )}
      {notes && (
        <button type="button" className="tbtn" aria-haspopup="dialog" aria-label={notesCopy.openLabel(notes.count)} onClick={notes.onOpen}>
          <Flag {...icon} />
          {notesCopy.list}
          {notes.count > 0 && <b className="num cnt">{notes.count}</b>}
        </button>
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
