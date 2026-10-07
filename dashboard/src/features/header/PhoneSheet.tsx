// The phone's sheet: what the numbers are, in one place. Live/Data, the
// quick periods (More opens the date-range picker), the comparison, the
// filters in force and Add. Its own chunk: nobody opens it on a wide screen.
import { ChevronRight, X } from 'lucide-react'
import { useRef, type PointerEvent } from 'react'
import { compareWords, periodLabel, type PickerValue } from '../../components/DatePicker'
import { Modal } from '../../components/Modal'
import { filterMenu, periodMenu } from '../../components/panelOpen'
import { truncateMiddle } from '../../lib/visitor'
import { PRESETS, presetById, type ISODate } from '../../lib/dates'
import { isShared } from '../../lib/me'
import { rowCopy } from './rowCopy'
import { sheetCopy } from './sheetCopy'
import '../../components/ActiveFilters.css'
import './PhoneSheet.css'

export interface SheetProps {
  /** The filters in force, each with what removes it. */
  active: { key: string; dim: string; op: string; not: boolean; value: string; flip: () => void; remove: () => void }[]
  value: PickerValue
  today: ISODate
  onChange: (v: PickerValue) => void
  /** Which of the two the sheet shows: the period, or the filters in force. */
  mode: 'date' | 'filters'
  onClear: () => void
  /** back: focus returns to the pill (not when another panel takes over). */
  onClose: (back?: boolean) => void
}

const QUICK = ['today', '7d', '30d', '90d']
/** A drag down this far closes the sheet. */
const DRAG_CLOSE = 70

export default function PhoneSheet(p: SheetProps) {
  const close = () => p.onClose()
  const box = useRef<HTMLDivElement>(null)
  const from = useRef<number | null>(null)
  // The date-range picker takes over from the sheet.
  const openPicker = () => {
    p.onClose(false)
    periodMenu.set(true)
  }
  // The filter menu takes over from the sheet, too.
  const openFilter = () => {
    p.onClose(false)
    filterMenu.set(true)
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
    if (dy > DRAG_CLOSE) close()
  }
  return (
    <Modal label={sheetCopy.sheet} onClose={close} className="row-sheet" keepSize={false}>
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
        {p.mode === 'date' && (
        <>
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
          <span>{sheetCopy.custom}</span>
          <span className="sheet-val">
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
          </span>
        </button>
        <button type="button" className="sheet-row" role="switch" aria-checked={p.value.compare !== 'none'} onClick={() => p.onChange({ ...p.value, compare: p.value.compare === 'none' ? 'previous' : 'none' })}>
          <span>{sheetCopy.compareRow}</span>
          <span className="sheet-val">{p.value.compare !== 'none' ? compareWords(p.value) : sheetCopy.off}</span>
        </button>
        </>
        )}
        {p.mode === 'filters' && !isShared() && (
          <div className="sheet-row sheet-filters">
            <span>{sheetCopy.filtersRow}</span>
            <div className="sheet-chips">
              {p.active.map((f) => (
                <span key={f.key} className="chip">
                  <span className="faint">
                    {f.dim}{' '}
                    <button type="button" className="op" aria-label={rowCopy.flip(f.dim, f.not)} onClick={f.flip}>
                      {f.op}
                    </button>
                  </span>
                  <b title={f.value}>{truncateMiddle(f.value, 32)}</b>
                  <button type="button" aria-label={rowCopy.removeSet(f.dim, f.op, f.value)} onClick={f.remove}>
                    <X size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                </span>
              ))}
              <button type="button" className="btn ghost filter" aria-haspopup="menu" onClick={openFilter}>
                {sheetCopy.add}
              </button>
              {p.active.length > 0 && (
                <button type="button" className="btn ghost filter" onClick={() => { p.onClear(); close() }}>
                  {rowCopy.clear}
                </button>
              )}
            </div>
          </div>
        )}
        <button type="button" className="btn sheet-done" onClick={close}>
          {sheetCopy.done}
        </button>
      </div>
    </Modal>
  )
}
