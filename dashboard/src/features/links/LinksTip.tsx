// The one-line explanation of tags, as a small (i) that opens on hover, focus or tap, on every screen size.
import { Info } from 'lucide-react'
import { Tooltip } from '../../kit/Tooltip'

export function LinksTip({ text, align = 'left' }: { text: string; align?: 'left' | 'right' }) {
  return (
    <Tooltip text={text} align={align}>
      {(p) => (
        <button type="button" className="yl-info" aria-label={text} {...p}>
          <Info size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </Tooltip>
  )
}
