// Back from Google: the address says so (?import=ga), and the import dialog
// opens on its own. Lazy: the dialog is not in the first load.
import { lazy, Suspense, useState } from 'react'
import type { Site } from '../../lib/api'

const ImportDialog = lazy(() => import('./ImportDialog').then((m) => ({ default: m.ImportDialog })))

const returning = () => new URLSearchParams(location.search).get('import') === 'ga'

export function GaReturn({ site }: { site: Site }) {
  const [open, setOpen] = useState(returning)
  if (!open) return null
  const close = () => {
    const q = new URLSearchParams(location.search)
    q.delete('import')
    q.delete('ga_error')
    history.replaceState(null, '', location.pathname + (q.size ? '?' + q.toString() : ''))
    setOpen(false)
  }
  return (
    <Suspense fallback={null}>
      <ImportDialog domain={site.domain} site={site.id} onClose={close} />
    </Suspense>
  )
}
