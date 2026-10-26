// A quiet row over a period chart: the period as a few segments on the left, and the Compare switch with what it is set
// against on the right. It reads and writes the address like the header's period menu does, so both stay in step.
import { useRef, type KeyboardEvent } from 'react'
import { hasYear } from '../periodWords'
import { copy } from '../briefing/copy'
import { readView, setView, useLocation, type ViewState } from '../../lib/url'
import { AGAINST, CHART_PERIODS, isOn, periodPatch, stepOf, switchPatch } from './chartPick'
import './chartRow.css'

export interface ChartControlsProps {
  site: { created_at?: number }
  /** Why a comparison that is on draws nothing; shown beside the switch. */
  why?: string | null
}

/** A row of choices that act as one control: arrows move through it, Tab leaves it. */
function Group<T extends string>({ label, items, value, text, off, onPick, cls }: { label: string; items: readonly T[]; value: T | null; text: (v: T) => string; off?: (v: T) => string | undefined; onPick: (v: T) => void; cls: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const key = (e: KeyboardEvent, i: number) => {
    const to = stepOf(e.key, i, items.length)
    if (to < 0) return
    e.preventDefault()
    refs.current[to]?.focus()
    if (!off?.(items[to])) onPick(items[to])
  }
  const stop = value === null ? 0 : items.indexOf(value)
  return (
    <div className={`cc-seg ${cls}`} role="radiogroup" aria-label={label}>
      {items.map((v, i) => (
        <button
          key={v}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={v === value}
          aria-disabled={off?.(v) ? true : undefined}
          title={off?.(v)}
          tabIndex={i === stop ? 0 : -1}
          className={v === value ? 'on' : ''}
          onKeyDown={(e) => key(e, i)}
          onClick={() => !off?.(v) && onPick(v)}
        >
          {text(v)}
        </button>
      ))}
    </div>
  )
}

export function ChartControls({ site, why }: ChartControlsProps) {
  const view: ViewState = readView(useLocation().params)
  const on = isOn(view.compare)
  const period = CHART_PERIODS.find((p) => p === view.period) ?? null
  const against = AGAINST.find((a) => a === view.compare) ?? null
  const year = hasYear(site)
  return (
    <div className="cc" data-testid="chart-controls">
      <Group cls="cc-period" label={copy.chartPeriods} items={CHART_PERIODS} value={period} text={(p) => copy.chartShort[p]} onPick={(p) => setView(periodPatch(p))} />
      <div className="cc-cmp">
        {on && why && (
          <span className="cc-why mk-quiet" role="note">
            {why}
          </span>
        )}
        <button type="button" role="switch" aria-checked={on} className="cc-sw" data-on={on} onClick={() => setView(switchPatch(!on))}>
          <span className="cc-knob" aria-hidden="true" />
          <span>{copy.chartCompare}</span>
        </button>
        {on && (
          <Group
            cls="cc-against"
            label={copy.chartAgainst}
            items={AGAINST}
            value={against}
            text={(a) => (a === 'year' ? copy.againstYear : copy.againstPrevious)}
            off={(a) => (a === 'year' && !year ? copy.againstYearNeeds : undefined)}
            onPick={(a) => setView({ compare: a })}
          />
        )}
      </div>
    </div>
  )
}
