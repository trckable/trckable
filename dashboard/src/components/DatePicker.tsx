// GA-style date range picker: presets, a two-month calendar with typed
// start/end fields, and a comparison (previous period, same period last
// year, or a custom range). Keyboard-first; the view stays in the URL.
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { pressed, useKeymap } from '../lib/keys'
import type { Bucket } from '../lib/api'
import {
  PRESETS,
  addMonths,
  compareRange,
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


/** Phone labels: the chip has room for "30d", not "Last 30 days". */
const SHORT: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yest.',
  '7d': '7d',
  '14d': '14d',
  '28d': '28d',
  '30d': '30d',
  '90d': '90d',
  '12mo': '12mo',
  wtd: 'Week',
  lastweek: 'Last wk',
  mtd: 'Month',
  lastmonth: 'Last mo',
  qtd: 'Quarter',
  lastquarter: 'Last qtr',
  ytd: 'Year',
  lastyear: 'Last yr',
}

export function DatePicker({ value, today, onChange, short, tz, bucket, autoBucket, onBucket }: Props & { short?: boolean; tz?: string; bucket?: Bucket; autoBucket?: string; onBucket?: (b?: Bucket) => void }) {
  const [open, setOpen] = useState(false)
  useKeymap()
  const root = useRef<HTMLDivElement>(null)
  const minDate = addMonths(today, -12 * MIN_BACK_YEARS)
  const cmp = compareRange(value.range, value.compare, value.compareCustom, value.period)
  const presetLabel = short ? SHORT[value.period] : PRESETS.find((p) => p.id === value.period)?.label

  // Global shortcuts: t/y/7/3/9/w/m/1 pick presets, ← → shift the period, c toggles compare.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]')) return
      const p = PRESETS.find((p) => p.key && pressed(e, 'period.' + p.id))
      const step = pressed(e, 'back') ? -1 : pressed(e, 'forward') ? 1 : 0
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
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const canNext = shiftRange(value.range, 1).to <= today

  return (
    <div ref={root} className="range-picker">
      <button
        type="button"
        className="btn icon ghost step"
        aria-label="Previous period"
        title="Previous period (←)"
        onClick={() => onChange({ ...value, period: 'custom', range: shiftRange(value.range, -1) })}
      >
        <Chevron dir="left" />
      </button>
      <button
        type="button"
        className="btn range"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 0, minWidth: 0, flex: short ? 'none' : 1 }}
      >
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
          <CalendarIcon />
          <span className="range-label">
            {presetLabel ?? fmtRange(value.range, today)}
            {/* Short labels ("Year", "30d") say which preset, not which days:
                where the button has the room (the phone toolbar), the days too. */}
            {short && presetLabel && <span className="range-days faint"> · {fmtRange(value.range, today)}</span>}
          </span>
          {value.period === 'now' && <span className="pulse" aria-hidden="true" />}
          <Chevron dir="down" />
        </span>
        {cmp && !short && (
          <span className="faint num" style={{ fontSize: 11, marginLeft: 24 }}>
            vs {fmtRange(cmp, today)}
          </span>
        )}
      </button>
      <button
        type="button"
        className="btn icon ghost step"
        aria-label="Next period"
        title="Next period (→)"
        disabled={!canNext}
        onClick={() => onChange({ ...value, period: 'custom', range: shiftRange(value.range, 1) })}
      >
        <Chevron dir="right" />
      </button>
      {open && (
        <Suspense fallback={null}>
        <Popover
          value={value}
          today={today}
          minDate={minDate}
          tz={tz}
          bucket={bucket}
          autoBucket={autoBucket}
          onBucket={onBucket}
          onCancel={() => setOpen(false)}
          onApply={(v) => {
            setOpen(false)
            onChange(v)
          }}
        />
        </Suspense>
      )}
    </div>
  )
}

export function Chevron({ dir }: { dir: 'left' | 'right' | 'down' }) {
  const Icon = dir === 'left' ? ChevronLeft : dir === 'right' ? ChevronRight : ChevronDown
  return <Icon size={16} strokeWidth={1.75} color="var(--text-2)" aria-hidden="true" />
}

export function CalendarIcon() {
  return (
    <Calendar size={17} strokeWidth={1.75} color="var(--text-2)" aria-hidden="true" />
  )
}
