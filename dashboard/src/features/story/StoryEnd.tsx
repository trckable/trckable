// The end of a replay: the period in one line, and a way to share it.
import { RotateCcw, Share2, X } from 'lucide-react'
import type { Bucket } from '../../lib/api'
import { copy } from './copy'
import { best, summaryLine } from './moments'

interface Props {
  period: string
  total: string
  labels: string[]
  visitors: number[]
  bucket: Bucket
  source?: string
  sales: number
  onShare: () => void
  onAgain: () => void
  onClose: () => void
}

export function StoryEnd(p: Props) {
  const line = summaryLine({ period: p.period, visitors: p.total, best: best(p.labels, p.visitors, p.bucket), bucket: p.bucket, source: p.source, sales: p.sales })
  return (
    <section className="story-end" aria-label={copy.summary}>
      <p className="story-end-line num" role="status">
        {line}
      </p>
      <span className="story-end-tools">
        <button type="button" className="btn icon ghost" onClick={p.onAgain} aria-label={copy.again} title={copy.again}>
          <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" className="btn primary story-share" onClick={p.onShare}>
          <Share2 size={15} strokeWidth={1.75} aria-hidden="true" />
          {copy.share}
        </button>
        <button type="button" className="btn icon ghost" onClick={p.onClose} aria-label={copy.close} title={copy.close}>
          <X size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </span>
    </section>
  )
}
