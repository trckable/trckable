import { copy } from './copy'
import type { ChartMode } from './chartMode'

/** The two ways to draw the half hour, as one small control: icons with tooltips, no words. */
export function ChartSwitch({ mode, onChange }: { mode: ChartMode; onChange: (m: ChartMode) => void }) {
  const items: { mode: ChartMode; label: string; d: string }[] = [
    { mode: 'bars', label: copy.bars, d: 'M3 13V8m5 5V3m5 10V6' },
    { mode: 'line', label: copy.line, d: 'M2 12c2-1 3-6 5-6s2 4 4 4 2-6 3-7' },
  ]
  return (
    <div className="mk-cs" role="group" aria-label={copy.chartStyle}>
      {items.map((x) => (
        <button key={x.mode} type="button" className={mode === x.mode ? 'on' : ''} aria-pressed={mode === x.mode} aria-label={x.label} title={x.label} onClick={() => onChange(x.mode)}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={x.d} />
          </svg>
        </button>
      ))}
    </div>
  )
}
