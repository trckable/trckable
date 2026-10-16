// The two things a card can say that come from outside the report: a new mention of the site today, and pages that got
// slower than their usual. Each is asked once and never blocks the page.
import { useEffect, useState } from 'react'
import { more } from '../../lib/apiMore'
import { addDays, type ISODate } from '../../lib/dates'
import type { Site } from '../../lib/api'
import { isShared } from '../../lib/me'
import { mentionsApi, type Mention } from '../../features/mentions/api'

export interface Extras {
  mention: Mention | null
  speed: { cur: [number, number, number]; usual: [number, number, number] } | null
}

const none: Extras = { mention: null, speed: null }

export function useExtras(site: Site, today: ISODate, on: boolean): Extras {
  const [got, setGot] = useState<{ key: string; x: Extras } | null>(null)
  const key = `${site.id}|${today}`
  useEffect(() => {
    if (!on || isShared()) return
    let live = true
    const day0 = Math.floor(new Date(today + 'T00:00:00Z').getTime() / 1000)
    const mention = site.mentions ? mentionsApi.list(site.id, '7d').then((r) => r.mentions.filter((m) => m.posted_at >= day0 - 3600).sort((a, b) => b.posted_at - a.posted_at)[0] ?? null, () => null) : Promise.resolve(null)
    const vit = (from: ISODate, to: ISODate) => more.vitals(site.id, { from, to }).then((v) => (v.samples >= 5 && v.lcp_ms != null && v.inp_ms != null && v.cls_1k != null ? ([v.lcp_ms / 1000, v.inp_ms, v.cls_1k / 1000] as [number, number, number]) : null), () => null)
    void Promise.all([mention, vit(today, today), vit(addDays(today, -28), addDays(today, -1))]).then(([m, c, u]) => live && setGot({ key, x: { mention: m, speed: c && u ? { cur: c, usual: u } : null } }))
    return () => {
      live = false
    }
  }, [key, site.id, site.mentions, today, on])
  return got && got.key === key ? got.x : none
}
