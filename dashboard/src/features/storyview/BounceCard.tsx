// The story's note on leaving after one page: shown only when it is clearly
// more or less than usual. More comes with "See why" (the guide, loaded then);
// less is a short good note.
import { DoorOpen } from 'lucide-react'
import { useState } from 'react'
import { Card } from '../../kit/Card'
import type { ReportQuery, Site } from '../../lib/api'
import { rangeQS } from '../../lib/api'
import { lazyLoad } from '../../lib/lazyLoad'
import { copy } from '../bounce/copy'
import { useBounceGuide } from '../bounce/useBounceGuide'
import { bounceCardOf } from './rules'

const Guide = lazyLoad(() => import('../bounce/BounceGuideModal'))

export function BounceCard({ site, query }: { site: Site; query: ReportQuery }) {
  const qs = rangeQS(query)
  const { guide } = useBounceGuide(site.id, qs)
  const [open, setOpen] = useState(false)
  const card = bounceCardOf(guide)
  if (!card) return null
  const high = card.kind === 'high'
  return (
    <Card className="sv-bounce" icon={<DoorOpen size={15} strokeWidth={1.8} />} tone={high ? 'bad' : 'good'} label={copy.label} title={copy.label}>
      <p className="sv-bounce-line">{high ? copy.cardHigh(card.tenths, card.usual) : copy.cardLow(card.tenths, card.usual)}</p>
      {high && (
        <button type="button" className="sv-link" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          {copy.seeWhy}
        </button>
      )}
      {open && (
        <Guide site={site.id} domain={site.domain} qs={qs} onClose={() => setOpen(false)} />
      )}
    </Card>
  )
}
