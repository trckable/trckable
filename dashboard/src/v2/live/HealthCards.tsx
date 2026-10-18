// Live's two health cards, which read their figures together after the first paint.
import type { Site } from '../../lib/api'
import { AiMentionsCard } from './AiMentionsCard'
import { SpeedUptimeCard } from './SpeedUptimeCard'
import { useHealth } from './useHealth'

interface Props {
  site: Site
  now: number
  downSince?: number
  /** Whether the cards are on screen or close to it; nothing is read before. */
  near: boolean
}

export function HealthCards({ site, now, downSince, near }: Props) {
  const health = useHealth(site, near)
  return (
    <>
      <SpeedUptimeCard site={site} health={health} now={now} downSince={downSince} />
      <AiMentionsCard site={site} health={health} />
    </>
  )
}
