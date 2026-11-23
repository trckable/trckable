// Overview: the four numbers, the shape of the period, and (in its own tabs) the hours and what moved. Pages and sources have their own sections.
import { valueOf } from '../filters'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import type { Overview as Model } from '../types'
import { Waiting } from '../../ui/Waiting'
import { XSec } from '../../ui/XBits'
import { XKcs, XKcsPlain } from '../../ui/XKcs'
import { viewerKcs } from '../viewerKcs'
import { Suspense } from 'react'
import type { Report } from '../../../lib/api'
import { OverviewChart } from './chartChunk'

export function Overview({ x, d }: { x: XCtx; d: Model & { report: Report } }) {
  if (!x.site.last_event_at && d.of === 0 && x.filters.length === 0) return <Waiting site={x.site} />
  return (
    <>
      <XKcs items={viewerKcs(d.kcs)} onChip={x.pick} chipOn={valueOf(x.filters, 'app')} />
      <XKcsPlain items={d.visits} />
      <XSec a={copy.shape} b={copy.per(d.per)} />
      {d.shape ? (
        <>
          <div className="xov-chart">
            <Suspense fallback={<i className="sk" />}>
              <OverviewChart x={x} report={d.report} />
            </Suspense>
          </div>
          {d.shape.why && <p className="shwhy">{d.shape.why}</p>}
        </>
      ) : (
        <div className="mk-quiet" style={{ padding: '8px 0' }}>
          {copy.notEnough}
        </div>
      )}
    </>
  )
}
