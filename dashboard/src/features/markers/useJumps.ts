// The jumps the markers show, asked for once the page is quiet (like the
// moments: markers are garnish and never take a slot among the first load's
// requests). One answer per site and period, kept for both charts; a failure
// is no markers, never an error. Only what a switched-on layer needs is asked.
import { useEffect, useState } from 'react'
import { call, rangeQS } from '../../lib/api'
import { addDays } from '../../lib/dates'
import { whenQuiet } from '../extras/quiet'
import { linksApi } from '../links/api'
import { hostLabel } from '../moments/words'
import { linkJumps, sourceJumps, type Jump } from './model'
import { hostChunks } from './sources'
import { useMarkers } from './settings'

/** The longest span the server draws daily small charts for (server/internal/api/spark.go). */
const SPAN = 90
const LINK_DAYS = 30

type Sparks = { days: string[]; rows: Record<string, number[]> }

const kept = new Map<string, Promise<Jump[]>>()

function once(key: string, ask: () => Promise<Jump[]>): Promise<Jump[]> {
  let got = kept.get(key)
  if (!got) {
    got = ask().catch(() => {
      kept.delete(key) // asked again next time
      return []
    })
    kept.set(key, got)
  }
  return got
}

function sourcesOf(site: string, from: string, to: string): Promise<Jump[]> {
  return once(`s|${site}|${from}|${to}`, async () => {
    const start = from < addDays(to, -SPAN) ? addDays(to, -SPAN) : from
    const parts = await Promise.all(
      hostChunks().map((hosts) => call<Sparks>('GET', `/sites/${encodeURIComponent(site)}/sparks` + rangeQS({ from: start, to }) + '&dim=referrer&' + hosts.map((h) => 'v=' + encodeURIComponent(h)).join('&'), undefined, undefined, true)),
    )
    const rows: Record<string, number[]> = {}
    for (const part of parts) Object.assign(rows, part.rows)
    return sourceJumps(parts[0].days, rows)
  })
}

function linksOf(site: string, from: string, to: string): Promise<Jump[]> {
  return once(`l|${site}|${from}|${to}`, async () => {
    const got = await linksApi.read(site, from, to)
    const days = Array.from({ length: LINK_DAYS }, (_, i) => addDays(to, i + 1 - LINK_DAYS))
    return linkJumps(days, got.links, (v) => (v.includes('.') ? hostLabel(v) : v))
  })
}

/** The source jumps and the link jumps of a period; each stays empty while its layer is off or its answer is on its way. */
export function useJumps(site: string, from: string, to: string): { sources: Jump[]; links: Jump[] } {
  const on = useMarkers()
  const [found, setFound] = useState<{ key: string; sources: Jump[]; links: Jump[] } | null>(null)
  const key = [site, from, to, on.sources, on.links].join('|')
  useEffect(() => {
    if (!on.sources && !on.links) return
    let live = true
    const cancel = whenQuiet(() => {
      void Promise.all([on.sources ? sourcesOf(site, from, to) : [], on.links ? linksOf(site, from, to) : []]).then(([sources, links]) => live && setFound({ key, sources, links }))
    })
    return () => {
      live = false
      cancel()
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content
  const mine = found && found.key === key ? found : null
  return { sources: on.sources ? (mine?.sources ?? []) : [], links: on.links ? (mine?.links ?? []) : [] }
}
