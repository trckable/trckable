// The phone's sheet: what the numbers are, in one place. Live/Data, the
// quick periods (More opens the date-range picker), the comparison, the
// filters in force and Add. Its own chunk: nobody opens it on a wide screen.
import { ChevronRight, X } from 'lucide-react'
import { useRef, type PointerEvent, type ReactNode } from 'react'
import { periodLabel, type PickerValue } from '../../components/DatePicker'
import { Modal } from '../../components/Modal'
import { setPeriodOpen } from '../../components/periodOpen'
import { PRESETS, presetById, type ISODate } from '../../lib/dates'
import { isShared } from '../../lib/me'
import { copy } from './copy'
import { sheetCopy } from './sheetCopy'
import './PhoneSheet.css'

export interface SheetProps {
  /** The filters in force, each with what removes it. */
  active: { key: string; text: string; remove: () => void }[]
  value: PickerValue
  today: ISODate
  onChange: (v: PickerValue) => void
  filter?: ReactNode
  /** Live/Data: the row's own switch. */
  switcher?: ReactNode
  onClose: () => void
}

const QUICK = ['today', '7d', '30d']
/** A drag down this far closes the sheet. */
const DRAG_CLOSE = 70

export default function PhoneSheet(p: SheetProps) {
  const box = useRef<HTMLDivElement>(null)
  const from = useRef<number | null>(null)
  // The date-range picker takes over from the sheet.
  const openPicker = () => {
    p.onClose()
    setPeriodOpen(true)
  }
  const move = (e: PointerEvent) => {
    if (from.current === null || !box.current) return
    box.current.style.transform = `translateY(${Math.max(0, e.clientY - from.current)}px)`
  }
  const release = (e: PointerEvent) => {
    if (from.current === null) return
    const dy = e.clientY - from.current
    from.current = null
    if (box.current) box.current.style.transform = ''
    if (dy > DRAG_CLOSE) p.onClose()
  }
  return (
    <Modal label={sheetCopy.sheet} onClose={p.onClose} className="row-sheet" keepSize={false}>
      <div ref={box} className="sheet-body">
        <div
          className="sheet-grab"
          role="presentation"
          onPointerDown={(e) => {
            from.current = e.clientY
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={move}
          onPointerUp={release}
          onPointerCancel={release}
        >
          <span />
        </div>
        {p.switcher}
        <div className="sheet-quick" role="group" aria-label={sheetCopy.periods}>
          {QUICK.map((id) => (
            <button key={id} type="button" aria-pressed={p.value.period === id} onClick={() => p.onChange({ ...p.value, period: id, range: (presetById(id) ?? PRESETS[0]).range(p.today) })}>
              {sheetCopy.quick[id]}
            </button>
          ))}
          <button type="button" aria-pressed={!QUICK.includes(p.value.period)} aria-haspopup="dialog" title={periodLabel(p.value, p.today)} onClick={openPicker}>
            {sheetCopy.more}
          </button>
        </div>
        <button type="button" className="sheet-row" aria-haspopup="dialog" onClick={openPicker}>
          <span>{sheetCopy.compareRow}</span>
          <span className="sheet-val">
            {copy.compareWith[p.value.compare]}
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
          </span>
        </button>
        {!isShared() && (
          <div className="sheet-row sheet-filters">
            <span>{sheetCopy.filtersRow}</span>
            <div className="sheet-chips">
              {p.active.map((f) => (
                <span key={f.key} className="chip">
                  {f.text}
                  <button type="button" aria-label={sheetCopy.removeFilter(f.text)} onClick={f.remove}>
                    <X size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                </span>
              ))}
              {p.filter}
            </div>
          </div>
        )}
        <button type="button" className="btn sheet-done" onClick={p.onClose}>
          {sheetCopy.done}
        </button>
      </div>
    </Modal>
  )
}
