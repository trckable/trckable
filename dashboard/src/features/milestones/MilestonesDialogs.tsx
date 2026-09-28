// The lazy half of milestones: the timeline and the share sheet.
import type { Site } from '../../lib/api'
import { ShareSheet } from './ShareSheet'
import { Timeline } from './Timeline'
import type { MilestonesState } from './useMilestones'
import './MilestonesDialogs.css'

export default function MilestonesDialogs({ ms, site }: { ms: MilestonesState; site: Site }) {
  const o = ms.open
  const close = () => ms.setOpen(null)
  if (o && 'share' in o) return <ShareSheet site={site} m={o.share} onClose={close} onChanged={ms.reload} />
  return <Timeline site={site} onShare={(m) => ms.setOpen({ share: m })} onClose={close} />
}
