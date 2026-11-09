// The numbers: the big one, and the small ones under the chart.
import type { Look, Metric } from './card'
import { copy } from './copy'
import { StatsPick } from './StatsPick'

export function NumbersSection({ look, metrics, revenue, set }: { look: Look; metrics: Metric[]; revenue: boolean; set: (l: Partial<Look>) => void }) {
  return (
    <>
      {(
        <div className="sd-chips" role="group" aria-label={copy.metric}>
          {metrics.map((m) => (
            <button key={m} type="button" className="sd-chip" aria-pressed={look.metric === m} onClick={() => set({ metric: m })}>
              {copy.metrics[m]}
            </button>
          ))}
        </div>
      )}
      <StatsPick look={look} revenue={revenue} set={set} />
    </>
  )
}
