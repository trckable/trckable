// What a figure with nothing behind it shows on Live, in every card: a faint ghost of what will appear, one plain line
// of what it is, and, where there is something to switch on, one button that goes to exactly that (see setupLinks) for
// someone who can change settings. A figure that is only waiting for visits (collecting) shows the ghost with a soft
// shimmer and the line alone. The block fills the room its card leaves and centres in it.
import type { Site } from '../../lib/api'
import { can } from '../../lib/permissions'
import { useV2Extras } from '../slots'
import { copy } from './copy'
import './empty.css'
import { runSetup, type LiveSetup } from './setupLinks'

/** The pieces of the ghost: the speed gauge, the thirty days of uptime, rows of a list. */
export type Ghost = 'gauge' | 'strip' | 'rows'

interface Props {
  site: Site
  line: string
  ghost: Ghost[]
  /** The one button: its words and what it opens, and the question "Why?" asks Peek beside it. None when nothing needs switching on. */
  action?: { label: string; setup: LiveSetup; ask: string }
  /** Switched on, only waiting for visits: the ghost shimmers, no button. */
  collecting?: boolean
}

const DAYS = 30

function GhostPiece({ kind }: { kind: Ghost }) {
  if (kind === 'gauge') {
    return (
      <svg className="lhgg" viewBox="0 0 200 108" aria-hidden="true">
        <path d="M14 100 A86 86 0 0 1 186 100" />
      </svg>
    )
  }
  if (kind === 'strip') {
    return (
      <span className="lhstrip lhgs" aria-hidden="true">
        {Array.from({ length: DAYS }, (_, i) => (
          <i key={i} className="unwatched" />
        ))}
      </span>
    )
  }
  return (
    <span className="lhgr" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

/** The setup button for someone who can change settings, and beside it, where there is Peek, "Why?": it never replaces the button. */
function Actions({ site, action }: { site: Site; action: NonNullable<Props['action']> }) {
  const { askPeekNow } = useV2Extras()
  const setup = can('site.settings')
  if (!setup && !askPeekNow) return null
  return (
    <div className="lhacts">
      {setup && (
        <button type="button" className="lhgo" onClick={() => runSetup(site, action.setup)}>
          {action.label}
        </button>
      )}
      {askPeekNow && (
        <button type="button" className="lhwhy" data-ask-peek="1" onClick={() => askPeekNow(action.ask)}>
          {copy.health.why}
        </button>
      )}
    </div>
  )
}

export function EmptyBlock({ site, line, ghost, action, collecting }: Props) {
  return (
    <div className={`lhempty${collecting ? ' collecting' : ''}`}>
      <div className="lhghost" aria-hidden="true">
        {ghost.map((g) => (
          <GhostPiece key={g} kind={g} />
        ))}
      </div>
      <span className="lhline">{line}</span>
      {action && <Actions site={site} action={action} />}
    </div>
  )
}
