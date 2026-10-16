// Live: reads the site's last half hour (or, in development with ?fixture=, the walkthrough's sample) and hands it to
// the view. The numbers are the server's last half hour and the stream's newer visits.
import { useEffect, useMemo, useState } from 'react'
import { addDays, todayIn } from '../../lib/dates'
import { useReport } from '../../lib/useReport'
import type { Sale, Site, Visit } from '../../lib/api'
import { useBusier } from '../../features/live/useBusier'
import { useLiveNow } from '../../features/live/useLiveNow'
import { FIXTURE, FIXTURE_COLORS, FIXTURE_WEEK, fixtureDownSince, fixtureNow, type FixtureKind } from './fixture'
import { LiveView, type LiveFeed } from './LiveView'

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
  }
  return <LiveView feed={feed} {...p} />
}

// The development sample, taken again every few seconds so the people in it keep coming and going as time passes.
function SampleLive({ kind, ...p }: LiveProps & { kind: FixtureKind }) {
  const [at, setAt] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAt(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])
  const feed: LiveFeed = {
    data: fixtureNow(kind, at),
    failed: false,
    got: at,
    clock: at,
    skew: 0,
    busier: null,
    week: kind === 'empty' ? [] : FIXTURE_WEEK,
    downSince: kind === 'down' ? fixtureDownSince(at) : undefined,
    colors: FIXTURE_COLORS,
    sample: true,
  }
  return <LiveView feed={feed} {...p} stream={{ online: null, visits: [], sales: [], connected: true, stale: false }} />
}

export function Live(p: LiveProps) {
  return FIXTURE ? <SampleLive kind={FIXTURE} {...p} /> : <ServerLive {...p} />
}
