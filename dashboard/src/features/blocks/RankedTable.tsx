import { delta } from '../../lib/format'
import { copy } from './copy'
import { Frame } from './Frame'
import { amountText } from './format'
import type { RankedBlock } from './types'

/** The top rows, each with its bar against the biggest, its value and, when there is a period before, its change. */
export function RankedTable({ b }: { b: RankedBlock }) {
  const rows = b.data.rows
  const top = Math.max(1, ...rows.map((r) => r.value))
  return (
    <Frame title={b.title} period={b.period} explore={b.explore}>
      {rows.length === 0 ? (
        <p className="blk-sub">{copy.noRows}</p>
      ) : (
        <ol className="blk-rows">
          {rows.map((r) => {
            const ch = delta(r.value, r.before)
            return (
              <li key={r.label}>
                <i style={{ width: `${Math.max(2, (r.value / top) * 100)}%` }} />
                <span title={r.label}>{r.label}</span>
                <b>{amountText(r.value, b.data)}</b>
                {ch && <em data-tone={ch.tone}>{ch.short}</em>}
              </li>
            )
          })}
        </ol>
      )}
    </Frame>
  )
}
