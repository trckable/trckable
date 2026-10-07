// One visitor's story, opened from Live's list or the People card: who they
// are, then each visit as a timeline, newest first. On a phone it is a
// bottom sheet. A lazy chunk: nobody downloads it before opening a journey.
import { X } from 'lucide-react'
import { useId } from 'react'
import { Loading } from '../../components/loading/Loading'
import { Modal } from '../../kit/Modal'
import type { ReportQuery, Site } from '../../lib/api'
import { copy } from './copy'
import { IdentityFacts, IdentityHead } from './IdentityCard'
import { JourneyMenu } from './JourneyMenu'
import { LiveNow } from './LiveNow'
import type { OnFilter } from './SourceChip'
import { useJourney, type JourneyState } from './useJourney'
import { VisitCard } from './VisitCard'
import './Journey.css'

function Body({ state, visitor, titleId, onFilter }: { state: JourneyState; visitor: string; titleId: string; onFilter?: OnFilter }) {
  if (state.status === 'loading') {
    return (
      <>
        <h2 id={titleId} className="jr-title-wait">
          {copy.title(visitor)}
        </h2>
        <Loading height={220} label={copy.loading} />
      </>
    )
  }
  if (state.status === 'failed') {
    return (
      <>
        <h2 id={titleId}>{copy.title(visitor)}</h2>
        <p className="faint" role="alert">
          {copy.failed(state.error)}
        </p>
      </>
    )
  }
  const { story, currency } = state
  const who = story.identity
  return (
    <>
      <IdentityHead who={who} titleId={titleId} />
      {who.live && <LiveNow path={who.currentPath} />}
      <IdentityFacts who={who} currency={currency} onFilter={onFilter} />
      {story.visits.length === 0 && <p className="faint">{copy.empty}</p>}
      <ol className="jr-visits" aria-label={copy.visitsLabel}>
        {story.visits.map((v) => (
          <VisitCard key={v.key} v={v} currency={currency} onFilter={onFilter} />
        ))}
      </ol>
      {story.truncated && <p className="faint">{copy.older}</p>}
    </>
  )
}

export function JourneyDialog({ site, visitor, query, onClose, onFilter }: { site: Site; visitor: string; query: ReportQuery; onClose: () => void; onFilter?: OnFilter }) {
  const state = useJourney(site.id, visitor, query)
  const titleId = useId()
  const pick: OnFilter | undefined = onFilter
    ? (dim, value) => {
        onClose()
        onFilter(dim, value)
      }
    : undefined
  return (
    <Modal label={copy.dialog} className="journey-dialog" keepSize={false} onClose={onClose}>
      <div className="jr-corner">
        <JourneyMenu site={site} visitor={visitor} />
        <button type="button" className="modal-close" aria-label={copy.close} onClick={onClose}>
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <Body state={state} visitor={visitor} titleId={titleId} onFilter={pick} />
    </Modal>
  )
}
