// Live's two health cards, which read their figures together after the first paint.
import type { Site } from '../../lib/api'
import { AiMentionsCard } from './AiMentionsCard'
import { SpeedUptimeCard } from './SpeedUptimeCard'
import { useHealth } from './useHealth'

interface Props {
  site: Site
  now: number
  downSince?: number
}

export function HealthCards({ site, now, downSince }: Props) {
  const health = useHealth(site, true)
  return (
    <>
      <SpeedUptimeCard site={site} health={health} now={now} downSince={downSince} />
      <AiMentionsCard site={site} health={health} />
    </>
  )
}
