// The small marks on the key numbers, in the dashboard's icon set: one for what
// each number stands for, before its name. One chunk, so the first load carries
// none of them: a tile keeps the mark's room (.kpi-ico) and it fills a moment
// after. The Revenue tile is in it too: it is only there for an owner without
// payments, and with `tile` this stands in for the mark.
import type { Site } from '../../lib/api'
import { Glyph, type MarkName } from './Glyph'
import { RevenueTile } from './RevenueTile'

export default function KpiMark(p: { k: MarkName; tile?: Site }) {
  return p.tile ? <RevenueTile site={p.tile} /> : <Glyph k={p.k} />
}
