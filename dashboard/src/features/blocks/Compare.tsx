import { delta } from '../../lib/format'
import { Frame } from './Frame'
import { amountText, toneOf } from './format'
import type { CompareBlock } from './types'

/** This period against the last: both numbers with a bar each on one scale, and the change. */
export function Compare({ b }: { b: CompareBlock }) {
  const { current, previous, invert } = b.data
  const top = Math.max(1, current.value, previous.value)
  const ch = delta(current.value, previous.value, invert)
  return (
    <Frame title={b.title} period={b.period} explore={b.explore}>
      <ul className="blk-cmp">
        {[current, previous].map((s, i) => (
          <li key={i} data-now={i === 0}>
            <span>{s.label}</span>
            <u>
              <i style={{ width: `${Math.max(2, (s.value / top) * 100)}%` }} />
            </u>
            <b>{amountText(s.value, b.data)}</b>
          </li>
        ))}
      </ul>
      {ch && (
        <p className="blk-delta" data-tone={toneOf(ch)} title={ch.label}>
          {ch.text}
        </p>
      )}
    </Frame>
  )
}
