// The period's keys on the Briefing, as they were on the old dashboard: N, T, Y, 7, 4, 3, 9, 1, W and M pick a period, the
// arrows step it back and forward, C compares with the period before. Not while typing, nor while a panel is open.
import { useEffect } from 'react'
import { PRESETS, shiftRange, type ISODate, type Range } from '../lib/dates'
import { pressed } from '../lib/keys'
import { setView, type ViewState } from '../lib/url'

/** The periods that have a key on the Briefing (Now and 28 days are not in its menu, only on the keys). */
export const KEYED = ['now', 'today', 'yesterday', '7d', '28d', '30d', '90d', '12mo', 'wtd', 'mtd']

/** ← is -1, → is +1, anything else 0. */
function stepOf(e: KeyboardEvent): -1 | 0 | 1 {
  if (pressed(e, 'back')) return -1
  return pressed(e, 'forward') ? 1 : 0
}

export function usePeriodKeys(o: { on: boolean; today: ISODate; range: Range; view: ViewState; day: boolean }) {
  const { on, today, range, view, day } = o
  useEffect(() => {
    if (!on) return
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable], [role=slider]') || document.querySelector('.xscrim.on, .pal.on, .cd.on, [aria-modal="true"]')) return
      const preset = PRESETS.find((p) => p.key && KEYED.includes(p.id) && pressed(e, 'period.' + p.id))
      const step = stepOf(e)
      if (preset) setView({ period: preset.id, from: undefined, to: undefined, bucket: undefined, day: undefined })
      else if (step) {
        const next = shiftRange(range, step)
        if (next.to > today) return
        setView({ period: 'custom', from: next.from, to: next.to, bucket: undefined, day: undefined })
      } else if (pressed(e, 'compare') && !day) setView({ compare: view.compare === 'none' ? 'previous' : 'none' })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [on, today, range, view.compare, day])
}
