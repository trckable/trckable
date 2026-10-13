// The compare panel of All sites: every site's visitors over the period as
// lines on one chart (a sheet on a phone). Its own chunk, fetched on first open.
import { Sheet } from '../kit/Sheet'
import type { SiteRow } from '../lib/api'
import { copy } from './allSitesCopy'
import { SiteLines } from './AllSitesChart'
import { startIndex } from './allSitesLogic'

export default function AllCompare({ rows, days, colors, onClose }: { rows: SiteRow[]; days: number; colors: Map<string, string>; onClose: () => void }) {
  const total = rows.reduce((a, r) => a + r.visitors, 0)
  return (
    <Sheet label={copy.compareLabel} onClose={onClose}>
      <SiteLines rows={rows} days={days} colors={colors} total={total} start={startIndex(rows)} />
    </Sheet>
  )
}
