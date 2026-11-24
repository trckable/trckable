// What the Speed & uptime and AI cards read: loading time, uptime, AI crawler hits, and Answers. None of it is asked before the page
// has painted, and a read that fails is a quiet empty block, never an error over Live. Speed goes through the same
// module check the Briefing uses, so a site that records no speed is not asked.
import { useEffect, useRef, useState } from 'react'
import { more } from '../../lib/apiMore'
import { addDays, todayIn } from '../../lib/dates'
import type { Site } from '../../lib/api'
import { hasAnswers } from '../../lib/me'
import { answersApi } from '../../features/answers/api'
import { incidents } from '../../features/incidents/api'
import { whenQuiet } from '../../features/extras/quiet'
import { onSiteWrite } from '../../lib/siteWrites'
import { moduleOn } from '../briefing/moduleOn'
import { aiOf, speedOf, uptimeFigure, UPTIME_DAYS, type AiFigure, type Speed, type UptimeFigure } from './health'

/** Each figure is undefined while it is read, null when there is nothing to say, else the figure. */
export interface Health {
  speed?: Speed | null
  /** Whether the site records speed at all: off, "Set up" turns it on; on, there are only too few visits. */
  vitalsOn?: boolean
  uptime?: UptimeFigure | null
  ai?: AiFigure | null
  /** The latest Answers round: in how many of the answers the site was seen; none until there is one. */
  answers?: { seen: number; total: number } | null
}

/** True until the first read has landed: every figure is then at least null, never undefined. */
export const loading = (h: Health): boolean => h.ai === undefined

export function useHealth(site: Site | undefined, on: boolean): Health {
  const [got, setGot] = useState<{ id: string; h: Health } | null>(null)
  // A write to this site's modules, Answers or Mentions (switching something on) reads every figure again.
  const [round, setRound] = useState(0)
  const id = site?.id
  // Each time the cards come near, the figures are read again; leaving Live does not throw away a read under way, only another site does.
  const [wasOn, setWasOn] = useState(false)
  const [visits, setVisits] = useState(0)
  if (on !== wasOn) {
    setWasOn(on)
    if (on) setVisits((n) => n + 1)
  }
  const current = useRef(id)
  useEffect(() => {
    current.current = id
  }, [id])
  useEffect(() => onSiteWrite((_, written) => written === id && setRound((n) => n + 1)), [id])
  const tz = site?.timezone
  const watched = site?.watched_since ?? 0
  const withAnswers = hasAnswers()
  useEffect(() => {
    if (!visits || !id || !tz) return
    const cancel = whenQuiet(() => {
      const today = todayIn(tz)
      const now = Math.floor(Date.now() / 1000)
      const speed = moduleOn(id, 'vitals').then(async (recorded) => ({ s: recorded ? await more.vitals(id, { from: addDays(today, -6), to: today }).then(speedOf, () => null) : null, on: recorded }))
      const uptime = watched ? incidents.period(id, Math.max(now - UPTIME_DAYS * 86400, watched), now).then((r) => uptimeFigure(r.incidents, today, tz, now, watched, r.summary.paused, r.paused_spans), () => null) : Promise.resolve(null)
      const ai = more.crawlers(id, { from: addDays(today, -6), to: today }).then(aiOf, () => null)
      const answers = withAnswers ? answersApi.report(id, { from: addDays(today, -6), to: today }).then((r) => (r.latest ? { seen: r.latest.seen, total: r.latest.total } : null), () => null) : Promise.resolve(null)
      void Promise.all([speed, uptime, ai, answers]).then(([s, u, a, an]) => current.current === id && setGot({ id, h: { speed: s.s, vitalsOn: s.on, uptime: u, ai: a, answers: an } }))
    })
    return cancel
  }, [id, tz, watched, withAnswers, visits, round])
  return got && got.id === id ? got.h : {}
}
