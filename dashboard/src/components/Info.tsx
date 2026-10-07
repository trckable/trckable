// An (i) that explains itself: the kit's Tooltip around a small button.
// `children` replace the (i): a small badge that explains itself the same way.
import type { ReactNode } from 'react'
import { Tooltip } from '../kit/Tooltip'

export function Info({ text, align = 'left', children }: { text: string; align?: 'left' | 'right'; children?: ReactNode }) {
  return (
    <Tooltip text={text} align={align}>
      {(p) => (
        <button type="button" className={children ? 'info-badge' : 'info-dot'} aria-label={children ? text : 'More about this'} {...p}>
          {children ?? 'i'}
        </button>
      )}
    </Tooltip>
  )
}
