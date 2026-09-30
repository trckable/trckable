// The main chart's hover card asks for its lines after the page is up, so
// the code that writes them (dayTips) is its own chunk, fetched while the
// browser is idle: no one points at the chart before then. Until it is
// here, a card has its headline figure and nothing under it.
import type { TimeChartProps } from '../../charts/TimeChart'
import { whenIdle } from '../../lib/lazyLoad'

type Tips = typeof import('./dayTips')
type Args = Parameters<Tips['chartTips']>[0]

let loaded: Tips | null = null
const load = () => import('./dayTips').then((m) => (loaded = m))
whenIdle(() => void load())

export function chartTips(a: Args): Pick<TimeChartProps, 'detail' | 'saleNote'> {
  return {
    detail: (i) => loaded?.chartTips(a).detail?.(i) ?? null,
    saleNote: (i) => loaded?.chartTips(a).saleNote?.(i) ?? null,
  }
}
