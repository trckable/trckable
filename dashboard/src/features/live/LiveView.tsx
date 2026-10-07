// Live mode: the site right now, on one screen. Loaded only when opened, so
// the dashboard's first load does not carry it. It reads the stream the
// dashboard already has open (lib/useLive) and the server's last 30 minutes
// (useLiveNow), and shows the second laid over the first.
import './Live.css'
import { useEffect } from 'react'
import type { Sale, Visit } from '../../lib/api'
import { useAnnounce } from './announce'
import { BusierLine } from './BusierLine'
import { copy } from './copy'
import { feedOf, seriesAt } from './model'
import { NowPanel } from './NowPanel'
import { OnSitePanel } from './OnSitePanel'
import { LiveCards } from './LiveCards'
import { liveCount, liveLink } from './liveLink'
import { useBusier } from './useBusier'
import { useLiveNow } from './useLiveNow'
import { Loading } from '../../components/loading/Loading'

export type LiveStream = {
  online: number | null
  visits: (Visit & { id: number })[]
  sales: (Sale & { id: number })[]
  connected: boolean
  stale: boolean
}

/** In cookieless mode a visit opens no journey, and the list says so. */
export default function LiveView({ site, timezone, stream, onVisitor, cookieless }: { site: string; timezone: string; stream: LiveStream; onVisitor?: (visitor: string) => void; cookieless?: boolean }) {
  const { data, failed, clock, skew } = useLiveNow(site, stream)
  const said = useAnnounce(stream.visits)
  const busier = useBusier(site)
  // The switch's dot shows whether the connection is up.
  useEffect(() => {
    liveLink.set(stream.connected)
    return () => liveLink.set(true)
  }, [stream.connected])
  // The stream's count is the freshest; while it is stuck, the polled one.
  let online = stream.online ?? data?.online ?? null
  if (stream.stale && data) online = data.online
  useEffect(() => liveCount.set(online), [online])
  const rows = data ? feedOf(data.recent, stream.visits, data.at, clock) : []
  return (
    <>
      <div className="live-view view-stage" role="region" aria-label={copy.region}>
        <BusierLine busier={busier} timezone={timezone} />
        {data ? (
          <>
            <NowPanel data={data} series={seriesAt(data, stream.visits, clock)} online={online ?? 0} connected={stream.connected} failed={failed} sales={stream.sales} timezone={timezone} />
            <OnSitePanel rows={rows} online={online} clock={clock} skew={skew} onVisitor={onVisitor} cookieless={cookieless} />
          </>
        ) : (
          <LiveLoading failed={failed} />
        )}
        <p className="sr" aria-live="polite" aria-atomic="true">
          {said}
        </p>
      </div>
      {data && <LiveCards data={data} rows={rows} />}
    </>
  )
}

function LiveLoading({ failed }: { failed: boolean }) {
  return (
    <>
      <section className="card live-panel live-now" aria-busy={!failed}>
        {failed ? (
          <p className="faint live-none" role="status">
            {copy.failed}
          </p>
        ) : (
          <Loading label={copy.loading}>{copy.loading}</Loading>
        )}
      </section>
      <section className="card live-panel live-onsite" aria-hidden="true" />
    </>
  )
}
