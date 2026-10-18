// What the Health strip reads: loading time, uptime, AI crawler hits and mentions. None of it is asked before the page
// has painted, and a read that fails is a quiet empty segment, never an error over Live. Speed goes through the same
// module check the Briefing uses, so a site that records no speed is not asked.
import { useEffect, useState } from 'react'
import { more } from '../../lib/apiMore'
import { addDays, todayIn } from '../../lib/dates'
import type { Site } from '../../lib/api'
import { hasMentions } from '../../lib/me'
import { incidents } from '../../features/incidents/api'
import { mentionsApi } from '../../features/mentions/api'
import { moduleOn } from '../briefing/moduleOn'
import { aiOf, speedOf, uptimeFigure, UPTIME_DAYS, type AiFigure, type UptimeFigure } from './health'

/** Each figure is undefined while it is read, null when there is nothing to say, else the figure. */
export interface Health {
  speed?: number | null
  uptime?: UptimeFigure | null
  ai?: AiFigure | null
  mentions?: number | null
}

/** Runs `fn` when the browser is idle, or shortly after the first paint where it has no idle time. Returns the way to cancel. */
function later(fn: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: 2000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const t = setTimeout(fn, 400)
  return () => clearTimeout(t)
}

export function useHealth(site: Site | undefined, on: boolean): Health {
  const [got, setGot] = useState<{ id: string; h: Health } | null>(null)
  const id = site?.id
  const tz = site?.timezone
  const watched = site?.watched_since ?? 0
  const withMentions = !!site?.mentions && hasMentions()
  useEffect(() => {
    if (!on || !id || !tz) return
    let live = true
    const cancel = later(() => {
      const today = todayIn(tz)
      const now = Math.floor(Date.now() / 1000)
      const speed = moduleOn(id, 'vitals').then((v) => (v ? more.vitals(id, { from: addDays(today, -6), to: today }) : null)).then(speedOf, () => null)
      const uptime = watched ? incidents.period(id, Math.max(now - UPTIME_DAYS * 86400, watched), now).then((r) => uptimeFigure(r.incidents, today, tz, now, watched), () => null) : Promise.resolve(null)
      const ai = more.crawlers(id, { from: addDays(today, -6), to: today }).then(aiOf, () => null)
      const mentions = withMentions ? mentionsApi.list(id, '7d').then((r) => r.mentions.length, () => null) : Promise.resolve(null)
      void Promise.all([speed, uptime, ai, mentions]).then(([s, u, a, m]) => live && setGot({ id, h: { speed: s, uptime: u, ai: a, mentions: m } }))
    })
    return () => {
      live = false
      cancel()
    }
  }, [id, tz, watched, withMentions, on])
  return got && got.id === id ? got.h : {}
}
