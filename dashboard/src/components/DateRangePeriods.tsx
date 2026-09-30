// The date picker's first step: five periods as a plain list, and More, which
// opens the rest in place with the comparison, the chart's detail and the way
// on to custom dates. Key hints show when a row is pointed at.
import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { caps, keyFor } from '../lib/keys'
import type { Bucket } from '../lib/api'
import { PRESETS, diffDays, fmtRange, type CompareMode, type ISODate, type Preset } from '../lib/dates'
import { CalendarIcon, type PickerValue } from './DatePicker'
import { BUCKET_LABEL, CMP_LABEL, PERIODS_FIRST, PERIODS_MORE, periodsCopy as t } from './dateRangeCopy'
import './ListPop.css'
import './DateRangePeriods.css'

const COMPARES: CompareMode[] = ['previous', 'year', 'custom']

/** Which granularities make sense for a period this long (undefined = auto). */
function bucketsFor(days: number): (Bucket | undefined)[] {
  const out: (Bucket | undefined)[] = [undefined]
  if (days <= 14) out.push('hour')
  if (days <= 400) out.push('day')
  if (days >= 7) out.push('week')
  if (days >= 60) out.push('month')
  return out.length > 2 ? out : []
}

const byId = (ids: string[]) => ids.flatMap((id) => PRESETS.filter((p) => p.id === id))

function Row({ p, on, onPick }: { p: Preset; on: boolean; onPick: () => void }) {
  return (
    <button type="button" className={on ? 'lrow on' : 'lrow'} aria-pressed={on} data-initial={on || undefined} onClick={onPick}>
      <span>{p.label}</span>
      {p.id === 'now' && <span className="pulse" aria-hidden="true" />}
      <span className="end" aria-hidden="true">
        {on && <Check size={14} strokeWidth={2.25} className="ok" />}
        {!on && p.key && <span className="k">{caps(keyFor('period.' + p.id)).join('')}</span>}
      </span>
    </button>
  )
}

export function Periods({
  value,
  today,
  tz,
  bucket,
  autoBucket,
  onBucket,
  onPeriod,
  onCompare,
  onCustom,
}: {
  value: PickerValue
  today: ISODate
  tz?: string
  bucket?: Bucket
  autoBucket?: string
  onBucket?: (b?: Bucket) => void
  onPeriod: (p: Preset) => void
  onCompare: (m: CompareMode) => void
  onCustom: () => void
}) {
  // Open from the start when what is chosen lives under More.
  const [more, setMore] = useState(PERIODS_MORE.includes(value.period) || value.compare === 'custom')
  const bucketName = (b: Bucket | undefined) => {
    if (b) return BUCKET_LABEL[b]
    if (!bucket && autoBucket) return t.autoWith(BUCKET_LABEL[autoBucket as Bucket].toLowerCase())
    return t.auto
  }
  const row = (p: Preset) => <Row key={p.id} p={p} on={value.period === p.id} onPick={() => onPeriod(p)} />
  const buckets = onBucket ? bucketsFor(diffDays(value.range.from, value.range.to) + 1) : []
  return (
    <div className="periods" role="group" aria-label={t.panelLabel}>
      {byId(PERIODS_FIRST).map(row)}
      <button type="button" className={more ? 'lrow ld-more open' : 'lrow ld-more'} aria-expanded={more} onClick={() => setMore(!more)}>
        <span>{t.more}</span>
        <span className="end">
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </button>
      <div className={more ? 'ld-x open' : 'ld-x'}>
        <div inert={!more}>
          <div className="ld-2">{byId(PERIODS_MORE).map(row)}</div>
          <div className="lline" />
          <div className="lopt">
            <span>{t.compare}</span>
            <div className="lseg cmp" role="group" aria-label={t.compare}>
              {COMPARES.map((m) => (
                <button key={m} type="button" aria-pressed={value.compare === m} onClick={() => onCompare(m)}>
                  {CMP_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          {buckets.length > 0 && (
            <div className="lopt">
              <span>{t.detail}</span>
              <div className="lseg" role="group" aria-label={t.detail}>
                {buckets.map((b) => (
                  <button key={b ?? 'auto'} type="button" aria-pressed={b === bucket || (!bucket && b === undefined)} onClick={() => onBucket?.(b)}>
                    {bucketName(b)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="lrow" onClick={onCustom}>
            <CalendarIcon />
            <span>{t.customDates}</span>
            <span className="end num" title={tz}>
              {fmtRange(value.range, today)}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
