import type { ReactNode } from 'react'
import { copy } from '../copy'

/** What stands in for the globe while its chunk loads: the same two cards at their final size. */
export function GlobeHold({ bar, height }: { bar: ReactNode; height?: number }) {
  return (
    <div className="liveview gwrap" style={height ? ({ '--gh': `${height}px` } as React.CSSProperties) : undefined}>
      <section className="mk-card gcard">
        <div className="lhead">
          <span className="lt">{copy.live}</span>
          {bar}
        </div>
        <div className="gstage" />
      </section>
      <section className="mk-card lon gside" />
    </div>
  )
}
