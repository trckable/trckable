// The card for a surge: the site is far busier than usual right now. One body for the busy moment
// (BusyBody): the people on the site and how many times the usual, the last
// hour in small, and where it came from. Under a hairline, "Only Google" (Explore on the moment, narrowed to the
// source) and "See it in Explore" (the moment's days on Overview, by the hour, against a week earlier). Calm: a soft
// glow that pulses twice, no confetti, and none of it moves with reduced motion. The story (SurgeModal) is told from
// the bell and from a notice. The browser notice (only for someone who said yes, and only when the tab is out of
// sight) is told once for each surge.
import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SideCard } from '../../components/SideCard/SideCard'
import { useSeen, wasSeen, markSeen } from '../install/seen'
import { BusyBody, BusyDot } from './BusyBody'
import { signals } from './copy'
import { onOpenSurgeStory } from './openStory'
import { tell } from './notify'
import SurgeModal from './SurgeModal' // the story: in this card's own chunk, which is itself lazy
import { busySpan, surgeFilter, surgeNotice, type Surge } from './surge'
import { useSurge } from './useSurge'
import { useSurgeActions } from './useSurgeActions'
import './surge.css'

const t = signals.surge

export default function SurgeCard({ site, first }: { site: { id: string; domain: string; timezone: string }; first?: number }) {
  const surge = useSurge(site.id, first)
  useNotice(surge, site.domain)
  if (!surge) return null
  return <Card key={surge.id} surge={surge} tz={site.timezone} />
}

/** Tells the browser once for each surge, when the tab is out of sight (in sight, the card is the notice). */
function useNotice(surge: Surge | null, domain: string) {
  const id = surge?.id
  useEffect(() => {
    if (!surge || !id || wasSeen('surge-told', id)) return
    markSeen('surge-told', id)
    if (document.visibilityState === 'visible' && document.hasFocus()) return
    const n = surgeNotice(surge, domain)
    tell(n.title, n.body, 'surge-' + id)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps -- once for each surge: its id says which
}

function Card({ surge, tz }: { surge: Surge; tz: string }) {
  const [gone, putAway] = useSeen('surge', surge.id)
  const { see, seeOnly } = useSurgeActions(surge, tz, putAway)
  const [story, setStory] = useState(false)
  useEffect(() => onOpenSurgeStory(surge.id, () => setStory(true)), [surge.id])
  const since = busySpan(surge, tz)
  return (
    <>
      {!gone && (
        <SideCard
          id="surge"
          asked // it will not keep: it comes up over a card that came up by itself
          label={t.label}
          closeLabel={t.close}
          kind={{ icon: <BusyDot live />, label: t.busyNow, tint: 'var(--accent)' }}
          when={{ text: since, title: since }}
          ghost
          onClose={putAway}
          actions={<Actions only={surgeFilter(surge) && surge.why.source ? t.only(surge.why.source) : ''} onOnly={seeOnly} see={see} />}
        >
          <BusyBody surge={surge} />
        </SideCard>
      )}
      {story && <SurgeModal surge={surge} tz={tz} onClose={() => setStory(false)} onSee={putAway} />}
    </>
  )
}

function Actions({ only, onOnly, see }: { only: string; onOnly: () => void; see: () => void }) {
  return (
    <>
      {only && (
        <button type="button" className="bz-only" onClick={onOnly}>
          {only}
        </button>
      )}
      <button type="button" className="bz-see" onClick={see}>
        {t.seeExplore} <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </>
  )
}
