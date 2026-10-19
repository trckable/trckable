import type { ReactNode } from 'react'
import { copy } from '../copy'

/** What stands in for the globe while its chunk loads: the same two cards at their final size. */
export function GlobeHold({ bar }: { bar: ReactNode }) {
  return (
    <div className="liveview gwrap">
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
