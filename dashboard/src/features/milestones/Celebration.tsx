// A milestone, reached: the ghost does a short celebration over the page
// (under 1.5 s, nothing at all with reduced motion) and a side card says what
// was reached, shows the card the server draws for sharing, and offers Share.
// One chunk of its own, fetched after the milestones arrive.
import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { SideCard } from '../../components/SideCard/SideCard'
import { Ghost } from '../../components/Logo'
import type { Milestone } from '../../lib/api'
import { reducedMotion } from '../../lib/motion'
import { useSettled } from '../../lib/settle'
import { copy } from './copy'
import { shareApi } from './share'
import { say } from './words'
import './Celebration.css'

export const SPARKS = 6

/** The ghost hops up from the corner the card slides in at, with a few sparks. Drawn once, then gone. */
function Party({ money }: { money: boolean }) {
  const [shown, setShown] = useState(!reducedMotion())
  if (!shown) return null
  return (
    <div className={money ? 'ms-party money' : 'ms-party'} aria-hidden="true" onAnimationEnd={(e) => e.target === e.currentTarget && setShown(false)}>
      <Ghost size={56} />
      {Array.from({ length: SPARKS }, (_, i) => (
        <i key={i} style={{ ['--i' as string]: i }} />
      ))}
    </div>
  )
}

export function Celebration({ m, site, onShare, onClose }: { m: Milestone; site: string; onShare: () => void; onClose: () => void }) {
  const w = say(m)
  const settled = useSettled()
  const line = `${w.big} ${w.label}`.trim()
  return (
    <>
      <Party money={w.money} />
      <SideCard
        id="milestone"
        label={copy.newMilestone}
        closeLabel={copy.dismiss}
        title={line}
        onClose={onClose}
        actions={
          <button type="button" className="btn primary" onClick={onShare}>
            <Share2 size={15} strokeWidth={1.75} aria-hidden="true" />
            {copy.share}
          </button>
        }
      >
        {/* The picture is asked for once the page has had its moment; its room is kept. */}
        <img className="ms-peek" src={settled ? shareApi.cardURL(site, m, { format: 'svg', theme: 'dark', amount: false }) : undefined} width={1200} height={630} alt={copy.card} />
      </SideCard>
    </>
  )
}
