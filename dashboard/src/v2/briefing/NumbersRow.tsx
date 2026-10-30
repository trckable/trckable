// The key figures under the Briefing's headline: each value big, its change against the period before small underneath.
import type { Result } from '../../lib/api'
import { copy } from './copy'
import { figuresOf } from './numbers'
import './numbersRow.css'

interface Props {
  cur: Result
  prev?: Result
  /** Writes an amount in the site's currency; absent where revenue is not shown. */
  money?: (minor: number) => string
}

export function NumbersRow({ cur, prev, money }: Props) {
  const figures = figuresOf(cur, prev, money)
  return (
    <dl className="nrow" aria-label={copy.numbersLabel} style={{ '--cols': figures.length } as React.CSSProperties}>
      {figures.map((f) => (
        <div key={f.key} className="nfig" data-k={f.key}>
          <dt>{f.label}</dt>
          <dd className="nv">{f.val}</dd>
          <dd className={`nd ${f.change?.verdict ?? f.change?.tone ?? ''}`} title={f.change?.label}>
            {f.change?.short ?? ' '}
          </dd>
        </div>
      ))}
    </dl>
  )
}
