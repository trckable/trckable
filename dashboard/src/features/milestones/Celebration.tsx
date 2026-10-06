// A milestone, reached: a side card says what was reached, shows the card the server draws for sharing, and offers Share.
// One chunk of its own, fetched after the milestones arrive.
import { Flag, Share2 } from 'lucide-react'
import { SideCard } from '../../components/SideCard/SideCard'
import type { Milestone } from '../../lib/api'
import { fmtDay } from '../../lib/dates'
import { useSettled } from '../../lib/settle'
import { copy } from './copy'
import { shareApi } from './share'
import { Rolling } from '../moments/Rolling'
import { say, value } from './words'
import './Celebration.css'

export function Celebration({ m, site, onShare, onClose }: { m: Milestone; site: string; onShare: () => void; onClose: () => void }) {
  const w = say(m)
  const settled = useSettled()
  // On a phone the card is a sheet over the page: the picture waits for the Share sheet.
  const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches
  return (
    <>
      <SideCard
        id="milestone"
        label={copy.newMilestone}
        closeLabel={copy.dismiss}
        kind={{ icon: <Flag size={14} strokeWidth={2} />, label: copy.newMilestone, tint: w.money ? 'var(--money)' : 'var(--accent)' }}
        when={{ text: copy.today, title: fmtDay(m.day, { weekday: true }) }}
        ghost
        title={
          <span className="side-num num">
            {w.big && w.n ? <Rolling to={w.n} fmt={(n) => value(m.kind, n, m.currency)} /> : w.big}
            <small>{w.label}</small>
          </span>
        }
        onClose={onClose}
        actions={
          <button type="button" className="btn primary" onClick={onShare}>
            <Share2 size={15} strokeWidth={1.75} aria-hidden="true" />
            {copy.share}
          </button>
        }
      >
        {/* The picture is asked for once the page has had its moment; its room is kept. */}
        <img className="ms-peek" src={settled && !phone ? shareApi.cardURL(site, m, { format: 'svg', theme: 'dark', amount: false }) : undefined} width={1200} height={630} alt={copy.card} />
      </SideCard>
    </>
  )
}
