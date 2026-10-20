import { delta } from '../../lib/format'
import { copy } from './copy'
import { Frame } from './Frame'
import { amountText, toneOf } from './format'
import type { NumberBlock } from './types'

/** One number with its change against the period before. */
export function NumberCard({ b }: { b: NumberBlock }) {
  const d = b.data
  const ch = delta(d.value, d.previous, d.invert)
  return (
    <Frame title={b.title} period={b.period} explore={b.explore}>
      <p className="blk-num">
        <strong>{amountText(d.value, d)}</strong>
        {ch && (
          <span className="blk-delta" data-tone={toneOf(ch)} title={ch.label}>
            {ch.text}
          </span>
        )}
      </p>
      {d.previous !== undefined && ch && <p className="blk-sub">{copy.was(amountText(d.previous, d))}</p>}
    </Frame>
  )
}
