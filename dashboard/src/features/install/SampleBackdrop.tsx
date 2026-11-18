// The setup screen's backdrop: a dotted globe with visits flying in, dimmed, behind the page while the site waits for its first
// visit. It is decoration only (aria-hidden, no pointer), and its code loads on its own after the first paint.
import { lazy, Suspense } from 'react'
import './sampleBackdrop.css'

const SetupGlobe = lazy(() => import('./SetupGlobe'))
/** What the globe keeps its dots away from: the page's words and its code. */
const AVOID = '.setup-words h1, .setup-words p, .setup-main .inst-tabs, .setup-main .code-card'

export function SampleBackdrop() {
  return (
    <div className="sb" aria-hidden="true" data-testid="sample-backdrop">
      <Suspense fallback={null}>
        <SetupGlobe avoid={AVOID} />
      </Suspense>
    </div>
  )
}
