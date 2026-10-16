// The replay as the Briefing lives it: the clock and its moments, the report as it stood at that time, the card the
// story is on lit and scrolled to, and the cards that have not happened yet held back.
import { useEffect, useMemo } from 'react'
import type { Result, Site } from '../../lib/api'
import type { Story } from '../briefing/cards'
import type { Extras } from '../briefing/useExtras'
import type { SliceData } from '../briefing/useSlices'
import { asOf, type Moment, type Topic } from './model'
import { useMoments } from './useMoments'
import { useReplay } from './useReplay'

const SELECT: Record<Topic, string> = {
  sources: '.icard[data-topic="sources"]',
  mentions: '.icard[data-topic="mentions"]',
  sales: '.icard[data-topic="sales"], .kc[data-k="money"]',
  uptime: '.icard[data-topic="uptime"], .kc[data-k="uptime"]',
}

const TOPIC: Partial<Record<Story['key'], Topic>> = { mentions: 'mentions', uptime: 'uptime', sources: 'sources' }

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
    document.querySelectorAll('.rphl').forEach((e) => e.classList.remove('rphl'))
    const sel = hl?.topic ? SELECT[hl.topic] : null
    const el = sel ? document.querySelector<HTMLElement>(sel) : null
    if (!el) return
    el.classList.add('rphl')
    const b = el.getBoundingClientRect()
    window.scrollTo(0, Math.max(0, window.scrollY + b.top - Math.max(96, (window.innerHeight - b.height) / 2 - 60)))
    return () => el.classList.remove('rphl')
  }, [hl])
  const cur = useMemo(() => (r.on && o.cur ? asOf(o.cur, r.t) : o.cur), [r.on, r.t, o.cur])
  /** A card that has a moment waits for it; the rest of the cards wait for most of the day. */
  const held = (s: Story): boolean => {
    if (!r.on) return false
    const m = moments.find((x) => x.topic === TOPIC[s.key])
    return m ? r.t < m.min : r.t < o.end * 0.75
  }
  return { r, moments, cur, held, clockAt: r.on ? Math.round(r.t) : undefined }
}

export type { Moment }
