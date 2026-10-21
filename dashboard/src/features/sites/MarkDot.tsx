// A site's mark with its state dot on the corner: one piece for the list's rows
// and the header's button, so both say the state the same way (StateDot.tsx
// decides it). Only a real problem is coloured: a quiet site's dot is grey.
import type { Site } from '../../lib/api'
import { SiteMark } from '../../components/SiteMark'
import { copy } from './copy'
import { dotState, type DotState } from './StateDot'

const CLASS = { now: 'now', live: '', quiet: 'quiet', stopped: 'down', new: 'off' } as const

/** The dot's class for a state: a quiet site's is grey (idle). */
export const dotClass = (state: DotState) => (state === 'quiet' ? 'idle' : CLASS[state])

export function MarkDot({ site, size, state = dotState(site), className, title }: { site: Site; size: number; state?: DotState; className?: string; title?: string }) {
  return (
    <span className="mkwrap">
      <SiteMark site={site} size={size} />
      <span className={`mk-dot ${className ?? dotClass(state)}`} aria-hidden="true" title={title ?? copy.dot[state]} />
    </span>
  )
}
