// The saved funnels as rows for the menu, read when it opens: the funnel list is the one the Briefing already holds for a minute.
import { useEffect, useState } from 'react'
import { diffDays, type Range } from '../../lib/dates'
import { readFunnel, savedFunnelsOf } from '../briefing/useExtras'
import { funnelRow, type GoalRow } from './model'

const MAX_FUNNELS = 3

export function useFunnelRows(site: string, range: Range, compared: boolean, on: boolean): GoalRow[] {
  const [rows, setRows] = useState<GoalRow[]>([])
  const { from, to } = range
  useEffect(() => {
    if (!on) return
    let live = true
    const days = diffDays(from, to) + 1
    savedFunnelsOf(site)
      .then((r) => Promise.all(r.funnels.filter((f) => f.steps.length >= 2).slice(0, MAX_FUNNELS).map((f) => readFunnel(site, { from, to }, days, { steps: f.steps, name: f.name }))))
      .then((list) => live && setRows(list.flatMap((f) => funnelRow(f, compared) ?? [])))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [site, from, to, compared, on])
  return rows
}
