// Settings → Data & privacy: the card that opens the privacy report. The
// report itself (and what it needs to read) loads when it is asked for.
import { FileText } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import type { Site } from '../../lib/apiMore'
import { copy } from './copy'

const ReportSheet = lazy(() => import('./ReportSheet'))

export function PrivacyReport({ site }: { site: Site }) {
  const [open, setOpen] = useState<'view' | 'print' | null>(null)
  return (
    <section className="card" id="privacy-report">
      <div className="card-head">
        <span className="icon-tile" aria-hidden="true">
          <FileText size={18} strokeWidth={1.75} />
        </span>
        <h2>{copy.card.title}</h2>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setOpen('view')}>
            {copy.card.view}
          </button>
          <button type="button" className="btn" onClick={() => setOpen('print')}>
            {copy.card.print}
          </button>
        </span>
      </div>
      {open && (
        <Suspense fallback={null}>
          <ReportSheet site={site} print={open === 'print'} onClose={() => setOpen(null)} />
        </Suspense>
      )}
    </section>
  )
}
