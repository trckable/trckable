// Live: reads the site's last half hour and hands it to the view. The numbers are the server's last half hour and the stream's newer visits.
import { useMemo } from 'react'
import { addDays, todayIn } from '../../lib/dates'
import { useReport } from '../../lib/useReport'
import type { Sale, Site, Visit } from '../../lib/api'
import { useBusier } from '../../features/live/useBusier'
import { useLiveNow } from '../../features/live/useLiveNow'
import { LiveView, type LiveFeed } from './LiveView'
import { LiveSkeleton } from '../ui/LiveSkeleton'

export type LiveStream = {
  online: number | null
  at?: number
  visits: (Visit & { id: number })[]
  sales: (Sale & { id: number })[]
  connected: boolean
  stale: boolean
}

export interface LiveProps {
  site: string
  timezone: string
  stream: LiveStream
  onVisitor?: (visitor: string) => void
  cookieless?: boolean
  whole?: Site
}

function ServerLive(p: LiveProps) {
  const { data, got, failed, clock, skew } = useLiveNow(p.site, p.stream)
  const busier = useBusier(p.site)
  const today = todayIn(p.timezone)
  const week = useReport(p.site, useMemo(() => ({ from: addDays(today, -6), to: today }), [today]))
  const feed: LiveFeed = {
    data,
    failed,
    got,
    clock,
    skew,
    busier,
    week: (week.data?.current.series ?? []).map((d) => d.visitors),
    downSince: p.whole?.down_since,
    ...fixtureLook(),
  }
  // Until the first answer (and when the site has none cached) the page's own shape, not a line of text.
  if (!data && !failed) return <LiveSkeleton />
  return <LiveView feed={feed} {...p} />
}

/** A development build answering from a fixture (dev/fixture) says so: the walkthrough's colours for its named sources, and nothing added to its blocks. */
const fixtureLook = (): Pick<LiveFeed, 'colors' | 'sample'> => (import.meta.env.DEV ? ((globalThis as { trckableFixture?: Pick<LiveFeed, 'colors' | 'sample'> }).trckableFixture ?? {}) : {})

export function Live(p: LiveProps) {
  return <ServerLive {...p} />
}
