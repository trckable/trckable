import { useEffect } from 'react'
import type { Visit } from '../../lib/api'
import { useLive } from '../../lib/useLive'

// Nothing to refresh: the first run only watches for visits.
const noRefetch = () => {}

/** Watches one site's live stream and reports its visits up; draws nothing. */
export function SiteWatch({ id, onVisits }: { id: string; onVisits: (id: string, visits: Visit[]) => void }) {
  const { visits } = useLive(id, noRefetch)
  useEffect(() => {
    onVisits(id, visits)
  }, [id, visits, onVisits])
  return null
}
