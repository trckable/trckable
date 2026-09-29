// The "Save this view" dialog and what saving does: the report's filters
// under a name, then the saved views reload. Its own chunk.
import { lazy, Suspense } from 'react'
import { toast } from '../../components/Toast'
import { api, messageOf } from '../../lib/api'

const SaveViewDialog = lazy(() => import('../../components/SaveViewDialog').then((m) => ({ default: m.SaveViewDialog })))

export function SaveViewHost(p: { site: string; filters: number; query: string; onClose: () => void; onSaved: () => void }) {
  return (
    <Suspense fallback={null}>
      <SaveViewDialog
        filters={p.filters}
        onClose={p.onClose}
        onSave={(name) =>
          api
            .saveSegment(p.site, name, p.query)
            .then(() => {
              toast(`Saved "${name}"`)
              p.onSaved()
              p.onClose()
            })
            .catch((e: unknown) => toast(messageOf(e), 'error'))
        }
      />
    </Suspense>
  )
}
