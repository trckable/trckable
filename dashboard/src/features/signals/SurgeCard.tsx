// The card for a surge: the site is far busier than usual right now. A big
// number counting up to who is on, how many times the usual as a chip, one line
// about who sent most of them (with the source's icon), the last hour drawing
// itself, and a small ghost hopping. Two buttons: More (the story, in a dialog)
// and See it (today in Data, filtered to the source). Calm: a soft glow that
// pulses twice, no confetti, and none of it moves with reduced motion. The
// browser notice (only for someone who said yes, and only when the tab is out of
// sight) is told once for each surge.
import { TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SideCard, useCardClose } from '../../components/SideCard/SideCard'
import { Ghost } from '../../components/Logo'
import { fmtInt } from '../../lib/format'
import { useSeen, wasSeen, markSeen } from '../install/seen'
import { Rolling } from '../moments/Rolling'
import { signals } from './copy'
import { tell } from './notify'
import { SourceLine } from './SourceLine'
import { SurgeSpark } from './SurgeChart'
import SurgeModal from './SurgeModal' // the story: in this card's own chunk, which is itself lazy
import { sourceLine, surgeChip, surgeNotice, type Surge } from './surge'
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
  const [story, setStory] = useState(false)
  if (gone) return null
  return (
    <>
      <SideCard
        id="surge"
        asked // it will not keep: it comes up over a card that came up by itself
        label={t.label}
        closeLabel={t.close}
        kind={{ icon: <TrendingUp size={14} strokeWidth={2} />, label: t.label, tint: 'var(--accent)' }}
        title={t.title}
        onClose={putAway}
        chart={<SurgeSpark surge={surge} />}
        actions={<Actions surge={surge} done={putAway} more={() => setStory(true)} />}
      >
        <div className="sg-hero">
          <b className="sg-count">
            <Rolling to={surge.online} fmt={fmtInt} />
          </b>
          <span className="sg-meta">
            <span className="sg-chip">{surgeChip(surge)}</span>
            <span className="sg-unit">{t.onlineNow}</span>
          </span>
          <span className="sg-ghost" aria-hidden="true">
            <Ghost size={44} />
          </span>
        </div>
        {sourceLine(surge) && <SourceLine surge={surge} />}
      </SideCard>
      {story && <SurgeModal surge={surge} tz={tz} onClose={() => setStory(false)} onSee={putAway} />}
    </>
  )
}

function Actions({ surge, done, more }: { surge: Surge; done: () => void; more: () => void }) {
  const close = useCardClose()
  const { see } = useSurgeActions(surge, () => {
    done()
    close()
  })
  return (
    <>
      <button type="button" className="btn ghost" aria-haspopup="dialog" onClick={more}>
        {t.more}
      </button>
      <button type="button" className="btn primary" onClick={see}>
        {t.see}
      </button>
    </>
  )
}
