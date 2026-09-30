// GA-style date range picker: presets, a two-month calendar with typed
// start/end fields, and a comparison (previous period, same period last
// year, or a custom range). Keyboard-first; the view stays in the URL.
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { copy } from '../features/header/copy'
import { closer, compareMenu, focusOpener, periodMenu, toggler } from './panelOpen'
import { CompareControl } from './CompareMenu'
import { pressed, useKeymap } from '../lib/keys'
import type { Bucket } from '../lib/api'
import {
  PRESETS,
  addMonths,
  compareRange,
  compareLabel,
  fmtRange,
  shiftRange,
  type CompareMode,
  type ISODate,
  type Range,
} from '../lib/dates'

const Popover = lazy(() => import('./DateRangePopover'))

export interface PickerValue {
  period: string // preset id or "custom"
  range: Range
  compare: CompareMode
  compareCustom?: Range
}

interface Props {
  value: PickerValue
  today: ISODate
  onChange: (v: PickerValue) => void
}


const MIN_BACK_YEARS = 20


/** Which granularities make sense for a period this long (undefined = auto). */


/** The comparison in the words the tiles use ("vs last year"). */
export function compareWords(value: PickerValue) {
  return value.compare === 'none' ? copy.noComparison : `vs ${compareLabel(value.period, value.compare, value.range)}`
}

/** The period in words: the preset's name, else its dates. */
export function periodLabel(value: PickerValue, today: ISODate) {
  return PRESETS.find((p) => p.id === value.period)?.label ?? fmtRange(value.range, today)
}

/** The same, shorter, for the phone's pill: "30 days", not "Last 30 days". */
export function periodShort(value: PickerValue, today: ISODate) {
  return periodLabel(value, today).replace(/^Last (?=\d)/, '')
}

/** ← is -1, → is +1, anything else 0. */
function stepOf(e: KeyboardEvent) {
  if (pressed(e, 'back')) return -1
  if (pressed(e, 'forward')) return 1
  return 0
}

export function DatePicker({ value, today, onChange, short, tz, bucket, autoBucket, onBucket }: Props & { short?: boolean; tz?: string; bucket?: Bucket; autoBucket?: string; onBucket?: (b?: Bucket) => void }) {
  // The period is plain words in the header's row, not a boxed control: the
  // arrows either side, the label opening the calendar.
  const open = periodMenu.use()
  useKeymap()
  const root = useRef<HTMLDivElement>(null)
  const minDate = addMonths(today, -12 * MIN_BACK_YEARS)
  const cmp = compareRange(value.range, value.compare, value.compareCustom, value.period)
  const presetLabel = PRESETS.find((p) => p.id === value.period)?.label
  const label = periodLabel(value, today)
  const calendar = <Calendar size={15} strokeWidth={1.75} className="range-icon" aria-hidden="true" />

  // Global shortcuts: t/y/7/3/9/w/m/1 pick presets, ← → shift the period, c toggles compare.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]')) return
      const p = PRESETS.find((p) => p.key && pressed(e, 'period.' + p.id))
      const step = stepOf(e)
      if (p) {
        e.preventDefault()
        onChange({ ...value, period: p.id, range: p.range(today) })
      } else if (step) {
        if (open || el.closest('[role=slider], .chart-wrap')) return
        const next = shiftRange(value.range, step)
        if (next.to > today || next.from < minDate) return
        e.preventDefault()
        onChange({ ...value, period: 'custom', range: next })
      } else if (pressed(e, 'compare')) {
        e.preventDefault()
        onChange({ ...value, compare: value.compare === 'none' ? 'previous' : 'none' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [value, today, open, minDate, onChange])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && periodMenu.set(false)
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const canNext = shiftRange(value.range, 1).to <= today
  const cmpText = cmp ? `vs ${compareLabel(value.period, value.compare, value.range)} (${fmtRange(cmp, today)})` : undefined

  useEffect(() => () => periodMenu.set(false), [])
  const popover = open && (
    <Suspense fallback={null}>
      <Popover
        value={value}
        today={today}
        minDate={minDate}
        tz={tz}
        bucket={bucket}
        autoBucket={autoBucket}
        onBucket={onBucket}
        onCancel={closer(periodMenu.set)}
        onApply={(v) => {
          periodMenu.set(false)
          focusOpener()
          onChange(v)
        }}
        onChange={onChange}
      />
    </Suspense>
  )
  // A phone has no buttons here: its row opens a sheet (features/header),
  // which hands over to this popover. The keys above stay.
  if (short) return <div ref={root}>{popover}</div>

  return (
    <div ref={root} className="range-picker quiet">
      <button
        type="button"
        className="btn icon ghost step"
        aria-label={copy.previous}
        title={`${copy.previous} (←)`}
        onClick={() => onChange({ ...value, period: 'custom', range: shiftRange(value.range, -1) })}
      >
        <Chevron dir="left" />
      </button>
      <button
        type="button"
        className="btn range"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          compareMenu.set(false)
          toggler(periodMenu.set, open)(e)
        }}
      >
        <span className="range-line">
          {calendar}
          <span className="range-label">{label}</span>
          {presetLabel && <span className="range-dates">{fmtRange(value.range, today)}</span>}
          {cmpText && <span className="sr">{cmpText}</span>}
          {value.period === 'now' && <span className="pulse" aria-hidden="true" />}
        </span>
      </button>
      <button
        type="button"
        className="btn icon ghost step"
        aria-label={copy.next}
        title={`${copy.next} (→)`}
        disabled={!canNext}
        onClick={() => onChange({ ...value, period: 'custom', range: shiftRange(value.range, 1) })}
      >
        <Chevron dir="right" />
      </button>
      <CompareControl value={value} onChange={onChange} />
      {popover}
    </div>
  )
}

const CHEVRON = { left: ChevronLeft, right: ChevronRight, down: ChevronDown }

export function Chevron({ dir }: { dir: 'left' | 'right' | 'down' }) {
  const Icon = CHEVRON[dir]
  return <Icon size={16} strokeWidth={1.75} color="var(--text-2)" aria-hidden="true" />
}

export function CalendarIcon() {
  return (
    <Calendar size={17} strokeWidth={1.75} color="var(--text-2)" aria-hidden="true" />
  )
}
