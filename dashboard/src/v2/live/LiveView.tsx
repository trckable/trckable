// Live, in the walkthrough's own layout: the half hour as bars with who is here now, the people on the site, and under
// them Analytics, Speed & uptime, and AI & mentions. The numbers are the server's last half hour and the stream's newer visits.
import { Suspense, useEffect, useMemo, useState } from 'react'
import { lazyLoad } from '../../lib/lazyLoad'
import { onlineNow } from '../../lib/live'
import { isShared } from '../../lib/me'
import { can } from '../../lib/permissions'
import { openSettings } from '../../lib/settings'
import { tag } from '../../i18n'
import { fmtMoney } from '../../lib/format'
import { channelColor } from '../../lib/palette'
import type { Site } from '../../lib/api'
import { BusyLine } from '../ui/BusyLine'
import { WhyInline } from '../ui/WhyInline'
import { whyDown } from '../briefing/why'
import { liveCount, liveLink } from '../../features/live/liveLink'
import { feedOf, seriesAt } from '../../features/live/model'
import type { Busier, LiveNow } from '../../features/live/api'
import { useTicking } from '../../features/live/useTicking'
import { AnalyticsCard } from './AnalyticsCard'
import { HealthCards } from './HealthCards'
import { Announce } from '../ui/Announce'
import { FeedList } from '../ui/FeedList'
import { barsOf, changeOf, listsOf, sourceParts, visitors30 } from './liveModel'
import { ChartSwitch } from './ChartSwitch'
import { keepChartMode, readChartMode, type ChartMode } from './chartMode'
import { MinuteChart } from './MinuteChart'
import { Tick } from './Tick'
import { useFit } from './cardWidth'
import { DOCS } from '../../components/footerLinks'
import { RevenueLock } from './RevenueLock'
import { SourceRows } from './SourceRows'
import { copy } from './copy'
import type { LiveStream } from './Live'

const MentionChip = lazyLoad(() => import('../../features/mentions/MentionChip'))

/** What the view is drawn from: the server's answer, the clock it ran by, and the few things read beside it. */
export interface LiveFeed {
  data: LiveNow | null
  failed: boolean
  /** The local time the answer arrived. */
  got: number
  clock: number
  skew: number
  busier: Busier | null
  /** Unix seconds the site stopped answering, while it is down. */
  downSince?: number
  /** True for the development sample: nothing beside the walkthrough's own blocks is added. */
  sample?: boolean
  /** Colours for named sources, where the sources are not channels (the development sample). */
  colors?: Record<string, string>
}

interface Props {
  feed: LiveFeed
  site: string
  timezone: string
  stream: LiveStream
  onVisitor?: (visitor: string) => void
  whole?: Site
}

export function LiveView({ feed, site, timezone, stream, onVisitor, whole }: Props) {
  const { data, failed, got, clock, skew, busier, downSince, colors } = feed
  const now = useTicking(clock, skew)
  const { ref, fit } = useFit<HTMLElement>()
  useEffect(() => {
    liveLink.set(stream.connected)
    return () => liveLink.set(true)
  }, [stream.connected])
  const online = onlineNow(stream, data?.online, data?.online, got) ?? null
  useEffect(() => liveCount.set(online), [online])
  const rows = useMemo(() => (data ? feedOf(data.recent, stream.visits, data.at, now) : []), [data, stream.visits, now])
  const lists = useMemo(() => listsOf(rows), [rows])
  const [mode, setMode] = useState<ChartMode>(readChartMode)
  const pick = (m: ChartMode) => {
    setMode(m)
    keepChartMode(m)
  }
  // Counts the visits that came in after the first look, for the line's end dot to beat once for each.
  const [first] = useState(() => stream.visits[0]?.id ?? 0)
  const beat = (stream.visits[0]?.id ?? 0) > first ? stream.visits[0].id : 0
  const upSources = useMemo(() => new Set((busier?.why ?? []).filter((w) => w.dim === 'source').map((w) => w.value)), [busier])
  if (!data) return <div className="liveview" role="region" aria-label={copy.live}><p className="mk-quiet">{failed ? copy.failed : copy.loading}</p></div>
  const n = online ?? 0
  const bars = barsOf(seriesAt(data, stream.visits, now))
  const phone = window.matchMedia('(max-width: 600px)').matches // a thumb taps the bar; it is no target to tab to
  const ch = changeOf(data.visitors, data.previous)
  const src = sourceParts(data.sources)
  const down = downSince !== undefined
  const pulseClass = down || !stream.connected ? 'off' : (beat && 'ev') || ''
  const at = (ms: number) => new Date(ms).toLocaleTimeString(tag ?? [], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone })
  const colorOf = (channel: string) => colors?.[channel] ?? channelColor(channel)
  return (
    <>
      <div className="liveview" role="region" aria-label={copy.live}>
        <Announce visits={stream.visits} />
        <section className="mk-card lnow" ref={ref} data-fit={fit}>
          <div className="lhead">
            <span key={beat} className={`mk-pulse ${pulseClass}`} />
            <span className="lt">{copy.live}</span>
            <span className="mk-quiet lm">{copy.window(at(now))}</span>
            <ChartSwitch mode={mode} onChange={pick} />
          </div>
          <div className="lfig">
            <div className="lmain">
              <span className="ll">{copy.onlineNow}</span>
              <b className="lbign"><Tick n={n} /></b>
            </div>
            <div className="lside">
              <span className="ll">{copy.visitors30}</span>
              <b className="lbign"><Tick n={visitors30(data.visitors, online)} /></b>
              {ch && <span className={`mk-ld ${ch.up ? 'up' : 'dn'}`}>{copy.change(ch.up, ch.pct)}</span>}
            </div>
          </div>
          <BusyLine busier={busier} site={site} timezone={timezone} />
          {!isShared() && !feed.sample && (
            <Suspense fallback={null}>
              <MentionChip site={site} domain={whole?.domain} />
            </Suspense>
          )}
          {down && (
            <div className="downbox">
              {copy.downBox(at(downSince * 1000), Math.max(0, Math.round((now - downSince * 1000) / 60_000)))}{' '}
              <WhyInline why={whyDown({ domain: whole?.domain ?? '', cause: whole?.down_cause, minutes: 0, ongoing: true })} />
            </div>
          )}
          <MinuteChart bars={bars} mode={mode} total={visitors30(data.visitors, online)} beat={beat} minute={Math.floor(now / 60_000)} phone={phone} timezone={timezone} label={(ago) => at(now - ago * 60_000)} />
          <div className="minl">
            <span>{copy.ago30}</span>
            <span>{copy.nowWord}</span>
          </div>
          <div className={`lbottom${data.revenue || can('payment.manage') ? ' money' : ''}`}>
            <div className="lsrc">
              <span className="ll">{copy.topSources}</span>
              <SourceRows parts={src.parts} color={colorOf} />
            </div>
            {data.revenue ? (
              <div className="lrev">
                <span className="ll">{copy.revenueToday}</span>
                <b className="lmoney">{fmtMoney(data.revenue.amount, data.revenue.currency, data.revenue.exponent)}</b>
              </div>
            ) : (
              whole &&
              can('payment.manage') &&
              !isShared() && (
                <div className="lrev">
                  <span className="ll">{copy.revenueToday}</span>
                  <RevenueLock go={copy.connect} onGo={() => openSettings(whole, 'payments')} onHow={() => window.open(DOCS, '_blank', 'noopener')} />
                </div>
              )
            )}
          </div>
        </section>
        <section className="mk-card lon">
          <div className="lhead">
            <span className="lt">{copy.onSite}</span>
            <span className="mk-quiet lm">{copy.people(n)}</span>
          </div>
          <FeedList key={site} rows={rows} up={upSources} clock={now} empty={down ? copy.nobodyDown : copy.nobody} onVisitor={onVisitor} cookieless={whole?.cookieless} />
        </section>
      </div>
      <div className="lcards">
        <AnalyticsCard today={data.today} lists={lists} />
        {whole && !feed.sample && !isShared() && <HealthCards site={whole} now={now} downSince={downSince} />}
      </div>
    </>
  )
}
