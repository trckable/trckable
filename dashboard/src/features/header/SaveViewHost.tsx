// The "Save this view" dialog and what saving does: the report's filters
// under a name, then the saved views reload. Its own chunk.
import { lazy, Suspense } from 'react'
import { toast } from '../../components/Toast'
import { fail, more } from '../../lib/apiMore'

const SaveViewDialog = lazy(() => import('../../components/SaveViewDialog').then((m) => ({ default: m.SaveViewDialog })))

export function SaveViewHost(p: { site: string; query: string; onClose: () => void; onSaved: () => void }) {
  return (
    <Suspense fallback={null}>
      <SaveViewDialog
        onClose={p.onClose}
        onSave={(name) =>
          more
            .saveSegment(p.site, name, p.query)
            .then(() => {
              toast(`Saved "${name}"`)
              p.onSaved()
              p.onClose()
            })
            .catch((e: unknown) => fail(e))
        }
      />
    </Suspense>
  )
}
