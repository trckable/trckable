// The main chart's head: what it shows, the "Mentions · N" chip when the period has some, and Replay in the corner.
import { lazy, Suspense, type ComponentProps, type ReactNode } from 'react'

const MentionsChip = lazy(() => import('../mentions/MentionsChip')) // its own chunk: a site with no mentions never loads it

export function ChartHead(p: { title: string; mentions?: ComponentProps<typeof MentionsChip>; children?: ReactNode }) {
  return (
    <div className="chart-head">
      <h2>{p.title}</h2>
      <span className="chart-head-tools">
        {p.mentions && (
          <Suspense fallback={null}>
            <MentionsChip {...p.mentions} />
          </Suspense>
        )}
        {p.children}
      </span>
    </div>
  )
}
