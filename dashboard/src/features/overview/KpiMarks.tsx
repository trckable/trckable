// The small marks on the key numbers, in the dashboard's icon set (lucide's
// drawings, inlined): one for what each number stands for, before its name,
// and the quiet way in to Settings → Payments in the strip's free room
// (KpiMarks.css). One chunk, so the first load carries none of them: a tile
// keeps the mark's room (.kpi-ico) and it fills a moment after.
import type { Site } from '../../lib/api'
import { canChange } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { marksCopy as copy } from './marksCopy'
import { showsPayHint } from './showsPayHint'
import './KpiMarks.css'

const ring = (r: number) => `M${12 - r} 12a${r} ${r} 0 1 0 ${2 * r} 0 ${r} ${r} 0 1 0-${2 * r} 0`
const MARKS = {
  visitors: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
  pageviews: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2zM14 2v5a1 1 0 0 0 1 1h5M10 9H8M16 13H8M16 17H8',
  bounce: 'm16 17 5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4',
  session: ring(10) + 'M12 6v6l4 2',
  revenue: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  conversion: ring(10) + ring(6) + ring(2),
  'per-visitor': 'M5 9a4 4 0 1 0 8 0 4 4 0 1 0-8 0M2 21a7 7 0 0 1 14 0M22 6h-3.5a1.75 1.75 0 0 0 0 3.5h2a1.75 1.75 0 0 1 0 3.5H17M19.5 4v11',
  pay: ring(10) + 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6',
}

/** `pay` is the way in to Payments: it asks for the site, and whether the report has money and is still loading. */
export default function KpiMark({ k, site, money, loading }: { k: keyof typeof MARKS; site?: Site; money?: boolean; loading?: boolean }) {
  const svg = (size: number) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={MARKS[k]} />
    </svg>
  )
  if (k !== 'pay') return svg(14)
  if (!site || !showsPayHint({ money, loading: !!loading, canChange: canChange() })) return null
  return (
    <button type="button" className="kpi-pay" aria-label={copy.connectPayments} title={copy.connectPayments} onClick={() => openSettings(site, 'payments')}>
      {svg(20)}
    </button>
  )
}
