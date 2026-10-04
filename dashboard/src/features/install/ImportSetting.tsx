// Settings → Install: the way to the import dialog for a site that has been
// running a while, where the first screen's card is long gone.
import { History } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Row } from '../../components/Row'
import type { Site } from '../../lib/api'
import { isViewer } from '../../lib/me'
import { first } from './firstCopy'

const ImportDialog = lazy(() => import('./ImportDialog').then((m) => ({ default: m.ImportDialog })))

export function ImportSetting({ site }: { site: Site }) {
  const [open, setOpen] = useState(false)
  if (isViewer()) return null
  return (
    <section className="card">
      <Row label={first.importSetting}>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          <History size={14} strokeWidth={1.75} aria-hidden="true" />
          {first.importDialog.google.start}
        </button>
      </Row>
      {open && (
        <Suspense fallback={null}>
          <ImportDialog domain={site.domain} site={site.id} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </section>
  )
}
