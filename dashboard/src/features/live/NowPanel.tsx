// The left panel: how many are here now, how many came in the last half
// hour, the minute-by-minute line, where they came from and, with the
// revenue module on, today's money.
import type { Sale } from '../../lib/api'
import { delta, fmtInt } from '../../lib/format'
import { useTween } from '../../lib/motion'
import type { LiveNow } from './api'
import { copy } from './copy'
import { LiveLine } from './LiveLine'
import { RevenueToday } from './RevenueToday'
import { SourcesBar } from './SourcesBar'
import { openMinute } from './switchView'

/** A number that rolls to its new value (reduced motion: it just changes). */
function Rolling({ value, className }: { value: number; className: string }) {
  const v = useTween(value, 600)
  return <span className={className}>{fmtInt(v)}</span>
}

function Status({ connected, failed }: { connected: boolean; failed: boolean }) {
  if (failed) return <span className="live-meta live-warn">{copy.failed}</span>
  if (!connected) return <span className="live-meta faint">{copy.reconnecting}</span>
  return <span className="live-meta faint live-calm">{copy.rightNow}</span>
}

export function NowPanel(p: { data: LiveNow; series: number[]; online: number; connected: boolean; failed: boolean; sales: (Sale & { id: number })[]; timezone: string }) {
  const d = delta(p.data.visitors, p.data.previous)
  return (
    <section className="card live-panel live-now" aria-labelledby="live-now-title">
      <div className="live-head-row">
        <span className="pulse" aria-hidden="true" style={{ opacity: p.connected ? 1 : 0.3 }} />
        <h2 id="live-now-title">{copy.title}</h2>
        <Status connected={p.connected} failed={p.failed} />
      </div>
      <div className="live-figures">
        <div className="live-figure">
          <span className="live-label">
            <span className="live-dot" aria-hidden="true" />
            {copy.onlineNow}
          </span>
          <Rolling className="live-online num" value={p.online} />
        </div>
        <div className="live-figure">
          <span className="live-label">{copy.visitors30}</span>
          <Rolling className="live-visitors num" value={p.data.visitors} />
          {d && (
            <span className={`live-delta num tone-${d.tone}`} aria-label={`${d.label} ${copy.vsBefore}`}>
              {d.text} {copy.vsBefore}
            </span>
          )}
        </div>
      </div>
      <LiveLine values={p.series} onOpen={(ago) => void openMinute(ago, p.timezone)} />
      <div className={p.data.revenue ? 'live-bottom money' : 'live-bottom'}>
        <SourcesBar sources={p.data.sources} />
        {p.data.revenue && <RevenueToday revenue={p.data.revenue} sales={p.sales} />}
      </div>
    </section>
  )
}
