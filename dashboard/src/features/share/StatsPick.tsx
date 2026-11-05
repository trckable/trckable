// Which small numbers sit under the card's chart: a Stats button and a compact
// panel with the numbers to tick, three at most (a fourth pushes the oldest out).
import { Check, ListChecks } from 'lucide-react'
import { Popover } from '../../kit'
import { statsFor, toggleStat, type Look } from './card'
import { copy } from './copy'

export function StatsPick({ look, revenue, set }: { look: Look; revenue: boolean; set: (l: Partial<Look>) => void }) {
  return (
    <Popover
      label={copy.stats}
      className="menu"
      trigger={(p) => (
        <button type="button" className="btn sd-stats-btn" title={copy.statsTitle} {...p}>
          <ListChecks size={16} strokeWidth={1.8} aria-hidden="true" />
          <span className="label">{copy.stats}</span>
        </button>
      )}
    >
      {() => (
        <div className="menu-list" role="menu" aria-label={copy.statsTitle}>
          {statsFor(look.metric, revenue).map((s) => {
            const on = look.stats.includes(s)
            return (
              <button key={s} type="button" role="menuitemcheckbox" aria-checked={on} className="mi" onClick={() => set({ stats: toggleStat(look.stats, s) })}>
                <span className="mt2">
                  <div className="nm">{copy.statNames[s]}</div>
                </span>
                {on && <Check size={14} strokeWidth={2.4} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </Popover>
  )
}
