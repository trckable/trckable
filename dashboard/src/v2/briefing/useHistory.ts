// The site's own past, read once a day for the "usual" it is told against: ninety days by day (the day chart, the
// record day, the run of days above usual) and, when the chart is by hour, the eight weeks before by hour.
import { useEffect, useState } from 'react'
import { api, type Point, type Report, type Site } from '../../lib/api'
import { addDays, type ISODate, type Range } from '../../lib/dates'

export interface History {
  daily: Point[] | null
  hourly: Point[] | null
}

const cache = new Map<string, Promise<Point[]>>()

export function read(site: string, from: ISODate, to: ISODate, bucket: 'day' | 'hour'): Promise<Point[]> {
  const key = `${site}|${bucket}|${from}|${to}`
  let p = cache.get(key)
  if (!p) {
    p = api.report(site, { from, to, bucket }).then((r) => r.current.series ?? [])
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

export function useHistory(site: Site, today: ISODate, hourly: boolean, on: boolean): History {
  const [got, setGot] = useState<{ key: string; daily: Point[] | null; hourly: Point[] | null } | null>(null)
  const key = `${site.id}|${today}|${hourly}`
  useEffect(() => {
    if (!on) return
    let live = true
    const day = read(site.id, addDays(today, -89), today, 'day').catch(() => null)
    const hour = hourly ? read(site.id, addDays(today, -56), addDays(today, -1), 'hour').catch(() => null) : Promise.resolve(null)
    void Promise.all([day, hour]).then(([daily, hr]) => live && setGot({ key, daily, hourly: hr }))
    return () => {
      live = false
    }
  }, [key, site.id, today, hourly, on])
  return got && got.key === key ? got : { daily: null, hourly: null }
}

const hours = new Map<string, Promise<Report>>()

/** The period by the hour, for the stretches the walkthrough draws by the hour (a week, a day or two) when the page read it by the day. */
export function useHourly(site: Site, range: Range, on: boolean): Report | null {
  const [got, setGot] = useState<{ key: string; r: Report } | null>(null)
  const key = `${site.id}|${range.from}|${range.to}`
  useEffect(() => {
    if (!on) return
    let live = true
    let p = hours.get(key)
    if (!p) {
      p = api.report(site.id, { from: range.from, to: range.to, bucket: 'hour' })
      p.catch(() => hours.delete(key))
      hours.set(key, p)
    }
    p.then(
      (r) => live && setGot({ key, r }),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [key, on, site.id, range.from, range.to])
  return on && got && got.key === key ? got.r : null
}

/** The walkthrough draws a week (the "7 days" period) and a day or two by the hour; anything longer by the day. */
export const wantsHours = (period: string, range: Range): boolean => period === '7d' || (new Date(range.to).getTime() - new Date(range.from).getTime()) / 864e5 <= 2
