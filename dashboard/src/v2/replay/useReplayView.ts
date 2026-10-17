// The replay as the Briefing lives it: the day's moments and the clock of the run, with the card the story is on lit.
// Nothing moves or appears on the page while it plays: the cards stay as the day left them.
import { useEffect } from 'react'
import type { Result, Site } from '../../lib/api'
import type { Extras } from '../briefing/useExtras'
import type { SliceData } from '../briefing/useSlices'
import type { Topic } from './model'
import { useMoments } from './useMoments'
import { useReplay } from './useReplay'

const SELECT: Record<Topic, string> = {
  sources: '.icard[data-topic="sources"]',
  mentions: '.icard[data-topic="mentions"]',
  sales: '.icard[data-topic="sales"], .kc[data-k="money"]',
  uptime: '.icard[data-topic="uptime"], .kc[data-k="uptime"]',
}

export function useReplayView(o: {
  site: Site
  today: string
  cur: Result | undefined
  /** Minutes of the site's day that have passed. */
  end: number
  dayStart: number
  slices: SliceData
  extras: Extras
  incidents: { started_at: number; ended_at: number | null }[]
  money?: (minor: number) => string
}) {
  const moments = useMoments({ site: o.site, today: o.today, until: o.end, slices: o.slices, total: o.cur?.kpis.visitors ?? 0, extras: o.extras, incidents: o.incidents, dayStart: o.dayStart, sales: [], money: o.money })
  const r = useReplay({ moments, end: o.end })
  const hl = r.on ? r.cur : null
  useEffect(() => {
    const sel = hl?.topic ? SELECT[hl.topic] : null
    const el = sel ? document.querySelector<HTMLElement>(sel) : null
    if (!el) return
    el.classList.add('rphl')
    return () => el.classList.remove('rphl')
  }, [hl])
  return { r, moments }
}
