// The three things a notice is for, found while the dashboard is open: a first
// sale from a source that had none, a spike in who is online, and tracking
// going quiet. What counts is in detect.ts; this feeds it and tells.
import { useEffect, useRef } from 'react'
import type { Site, Visit } from '../../lib/api'
import { signals } from './copy'
import { gained, silentHours, Usual } from './detect'
import { tell } from './notify'

type Props = {
  site: Site
  online: number | null
  visits: Visit[]
  /** Which report the sources are from (site, period, filters): a different one is a different list, not news. */
  scope: string
  /** The sources that have sales in the period on screen, when it reaches today. */
  sources?: string[]
}

const MINUTE = 60_000

export function useNotices({ site, online, visits, scope, sources }: Props) {
  const name = site.domain
  // A source that had no sale in the report before this one.
  const known = useRef<{ scope: string; list: string[] | null }>({ scope, list: null })
  useEffect(() => {
    if (!sources) return
    const before = known.current.scope === scope ? known.current.list : null
    known.current = { scope, list: sources }
    const [first] = gained(before, sources)
    if (first) tell(signals.firstSource(first), signals.firstSourceBody(name), 'source-' + first)
  }, [scope, sources, name])

  // A spike against the online counts this tab has seen.
  const usual = useRef(new Usual())
  useEffect(() => {
    if (online !== null && usual.current.add(online)) tell(signals.spike(online), signals.spikeBody(name), 'spike')
  }, [online, name])

  // Quiet for hours, told once for each silence: the next visit starts it over.
  const last = useRef(Math.max((site.last_event_at ?? 0) * 1000, 0))
  const told = useRef(false)
  useEffect(() => {
    if (visits[0]) {
      last.current = Math.max(last.current, visits[0].ts)
      told.current = false
    }
  }, [visits])
  useEffect(() => {
    const t = setInterval(() => {
      const hours = silentHours(last.current, Date.now())
      if (hours && !told.current) {
        told.current = true
        tell(signals.stopped(name), signals.stoppedBody(hours), 'stopped')
      }
    }, MINUTE)
    return () => clearInterval(t)
  }, [name])
}
