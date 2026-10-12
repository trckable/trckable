// A landing path as one line: long ones keep their start and tail, the full path is in the tooltip and the label.
import { Tooltip } from '../../kit/Tooltip'
import { midTruncate } from './surge'
import './surge.css'

export function PathChip({ page, onPick }: { page: string; onPick: () => void }) {
  return (
    <Tooltip text={page}>
      {(p) => (
        <button type="button" className="sgm-path" {...p} aria-label={page} onClick={onPick}>
          {midTruncate(page)}
        </button>
      )}
    </Tooltip>
  )
}
