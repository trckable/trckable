// The date picker's first step: the periods in one even grid, the comparison
// and the chart's detail under them, and the way on to custom dates.
import { Check, Clock3 } from 'lucide-react'
import { useId } from 'react'
import { Switch } from './Switch'
import { caps, keyFor } from '../lib/keys'
import type { Bucket } from '../lib/api'
import { VISIBLE_PRESETS, diffDays, fmtDay, fmtRange, type ISODate, type Preset, type Range } from '../lib/dates'
import { CalendarIcon, type PickerValue } from './DatePicker'
import { BUCKET_LABEL, PERIOD_GROUPS, periodsCopy as t } from './dateRangeCopy'
import './DateRangePeriods.css'

/** Which granularities make sense for a period this long (undefined = auto). */
function bucketsFor(days: number): (Bucket | undefined)[] {
  const out: (Bucket | undefined)[] = [undefined]
  if (days <= 14) out.push('hour')
  if (days <= 400) out.push('day')
  if (days >= 7) out.push('week')
  if (days >= 60) out.push('month')
  return out.length > 2 ? out : []
}

/** The row's last column: the tick when chosen, else its key, else nothing,
 *  in a slot of the same width either way so every label lines up. */
function PeriodEnd({ preset, on }: { preset: Preset; on: boolean }) {
  if (on) return <Check size={14} strokeWidth={2.25} className="period-end period-check" aria-hidden="true" />
  if (!preset.key) return <span className="period-end" aria-hidden="true" />
  return (
    <span className="period-end period-key" aria-hidden="true">
      {caps(keyFor('period.' + preset.id)).join('')}
    </span>
  )
}

export function Periods({
  draft,
  value,
  today,
  tz,
  bucket,
  autoBucket,
  compareRange,
  onDraft,
  onBucket,
  onApply,
  onCustom,
}: {
  draft: PickerValue
  value: PickerValue
  today: ISODate
  tz?: string
  bucket?: Bucket
  autoBucket?: string
  compareRange: Range | null
  onDraft: (f: (d: PickerValue) => PickerValue) => void
  onBucket?: (b?: Bucket) => void
  onApply: (v: PickerValue) => void
  onCustom: () => void
}) {
  const compareId = useId()
  const comparing = draft.compare !== 'none'
  const bucketName = (b: Bucket | undefined) => {
    if (b) return BUCKET_LABEL[b]
    if (!bucket && autoBucket) return t.autoWith(BUCKET_LABEL[autoBucket as Bucket].toLowerCase())
    return t.auto
  }
  const compareNote = () => {
    if (comparing && compareRange) return fmtRange(compareRange, today)
    return t.compareHint
  }
  const presets = VISIBLE_PRESETS()

  return (
    <div className="periods" role="listbox" aria-label={t.panelLabel}>
      <div className="periods-head">
        <Clock3 size={14} strokeWidth={1.75} aria-hidden="true" />
        <span className="num">{new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz })}</span>
        <span className="faint">{fmtDay(today, { weekday: true })}</span>
        {tz && <span className="tz">{tz.split('/').pop()?.replace(/_/g, ' ')}</span>}
      </div>
      {PERIOD_GROUPS.map((g) => (
        <div key={g.name} className="periods-group" role="group" aria-label={g.name}>
          <span className="periods-group-head" aria-hidden="true">
            {g.name}
          </span>
          <div className="periods-grid">
            {presets
              .filter((p) => g.ids.includes(p.id))
              .map((p) => {
                const on = draft.period === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={on ? 'period on' : 'period'}
                    onClick={() => onApply({ ...draft, period: p.id, range: p.range(today) })}
                  >
                    <span className="period-name">{p.label}</span>
                    {p.id === 'now' && <span className="pulse" aria-hidden="true" />}
                    <PeriodEnd preset={p} on={on} />
                  </button>
                )
              })}
          </div>
        </div>
      ))}
      <div className="periods-options">
        <label className="periods-compare" htmlFor={compareId}>
          <span className="compare-text">
            <span>{t.compare}</span>
            <span className="faint">{compareNote()}</span>
          </span>
          <Switch id={compareId} on={comparing} label={t.compare} onChange={() => onDraft((d) => ({ ...d, compare: d.compare !== 'none' ? 'none' : 'previous' }))} />
        </label>
        {onBucket && (
          <div className="periods-bucket">
            <span>{t.detail}</span>
            <div className="seg" role="group" aria-label={t.detail}>
              {bucketsFor(diffDays(draft.range.from, draft.range.to) + 1).map((b) => (
                <button key={b ?? 'auto'} type="button" aria-pressed={b === bucket || (!bucket && b === undefined)} onClick={() => onBucket(b)}>
                  {bucketName(b)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="periods-foot">
        <span className="periods-range num">{fmtRange(draft.range, today)}</span>
        <button type="button" className="btn" onClick={onCustom}>
          <CalendarIcon />
          {t.customDates}
        </button>
        {draft.compare !== value.compare && (
          <button type="button" className="btn primary" onClick={() => onApply(draft)}>
            {t.apply}
          </button>
        )}
      </div>
    </div>
  )
}
