// Ask is a drawer most visits never open: it loads the first time it is
// asked for, then stays mounted so it can slide shut and open again.
import { lazy, Suspense, useState, type ComponentProps } from 'react'

const Panel = lazy(() => import('./AskPanel').then((m) => ({ default: m.AskPanel })))

export function AskPanel(p: ComponentProps<typeof Panel>) {
  const [used, setUsed] = useState(false)
  if (p.open && !used) setUsed(true)
  if (!used) return null
  return (
    <Suspense fallback={null}>
      <Panel {...p} />
    </Suspense>
  )
}
