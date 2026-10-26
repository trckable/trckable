// Live, in the walkthrough's own layout: the half hour as bars with who is here now, the people on the site, and under
// them Analytics, Speed & uptime, and AI & mentions. The numbers are the server's last half hour and the stream's newer visits.
import { Suspense, useEffect, useMemo, useState } from 'react'
import { lazyLoad, warm } from '../../lib/lazyLoad'
import { onlineNow } from '../../lib/live'
import { isShared } from '../../lib/me'
import { can } from '../../lib/permissions'
import { openSettings } from '../../lib/settings'
import { tag } from '../../i18n'
import { fmtMoney, dateFmt } from '../../lib/format'
import { channelColor } from '../../lib/palette'
import type { Site } from '../../lib/api'
import { WhyInline } from '../ui/WhyInline'
import { plainSpan } from '../../lib/plainSpan'
import { downStateOf } from '../../features/sitestatus/status'
import { whyDown } from '../briefing/why'
import { liveCount, liveLink } from '../../features/live/liveLink'
import { feedOf, seriesAt } from '../../features/live/model'
import type { Busier, LiveNow } from '../../features/live/api'
import { useTicking } from '../../features/live/useTicking'
import { AnalyticsCard } from './AnalyticsCard'
import { useTodayLists } from './useTodayLists'
import { HealthCards } from './HealthCards'
import { useNear } from './useNear'
import { Announce } from '../ui/Announce'
import { FeedList } from '../ui/FeedList'
import { barsOf, changeOf, listsOf, sourceParts, visitors30 } from './liveModel'
import { ChartSwitch } from './ChartSwitch'
import { keepChartMode, readChartMode, type ChartMode } from './chartMode'
import { GlobeSwitch } from './GlobeSwitch'
import { GlobeHold } from './globe/GlobeHold'
import { keepGlobe, readGlobe } from './viewMode'
import { MinuteChart } from './MinuteChart'
import { Tick } from './Tick'
import { useFit } from './cardWidth'
import { DOCS } from '../../components/footerLinks'
import { RevenueLock } from './RevenueLock'
import { useWanted } from '../setup/useWanted'
import { SourceRows } from './SourceRows'
import { copy } from './copy'
import type { LiveStream } from './Live'
import { QUERY } from '../../kit/breakpoints'

const MentionChip = lazyLoad(() => import('../../features/mentions/MentionChip'))
const GlobePanel = lazyLoad(() => import('./globe/GlobePanel'))

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
  const mayAsk = !!whole && can('payment.manage') && !isShared()
  const want = useWanted(whole?.id ?? null, mayAsk)
  // Until the checklist is read the prompt's space is held (unseen), so nothing moves when it shows or goes.
  const holdRevenue = mayAsk && !want.known
  const askRevenue = mayAsk && want('rev')
  const [cardsRef, cardsNear] = useNear()
  useEffect(() => {
    liveLink.set(stream.connected)
    return () => liveLink.set(true)
  }, [stream.connected])
  const online = onlineNow(stream, data?.online, data?.online, got) ?? null
  useEffect(() => liveCount.set(online), [online])
  const rows = useMemo(() => (data ? feedOf(data.recent, stream.visits, data.at, now) : []), [data, stream.visits, now])
  const lists = useMemo(() => listsOf(rows), [rows])
  const day = useTodayLists(site, timezone, data?.today?.visitors ?? 0)
  const [mode, setMode] = useState<ChartMode>(readChartMode)
  const pick = (m: ChartMode) => {
    setMode(m)
    keepChartMode(m)
  }
  const [globe, setGlobe] = useState(() => readGlobe() && !isShared())
  const showGlobe = (on: boolean) => {
    setGlobe(on)
    keepGlobe(on)
  }
  // Counts the visits that came in after the first look, for the line's end dot to beat once for each.
  const [first] = useState(() => stream.visits[0]?.id ?? 0)
  const beat = (stream.visits[0]?.id ?? 0) > first ? stream.visits[0].id : 0
  const upSources = useMemo(() => new Set((busier?.why ?? []).filter((w) => w.dim === 'source').map((w) => w.value)), [busier])
  if (!data) return <div className="liveview" role="region" aria-label={copy.live}><p className="mk-quiet">{failed ? copy.failed : copy.loading}</p></div>
  const n = online ?? 0
  const bars = barsOf(seriesAt(data, stream.visits, now))
  const phone = window.matchMedia(QUERY.xs).matches // a thumb taps the bar; it is no target to tab to
  const ch = changeOf(data.visitors, data.previous)
  const src = sourceParts(data.sources)
  const down = downSince !== undefined
  const checkOnly = !!whole && downStateOf(whole) === 'visitors' // our check fails while visitors arrive: not an outage we know of
  const pulseClass = down || !stream.connected ? 'off' : (beat && 'ev') || ''
  const at = (ms: number) => dateFmt(tag, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(ms))
  const colorOf = (channel: string) => colors?.[channel] ?? channelColor(channel)
  const bar = isShared() ? null : <GlobeSwitch on={globe} onChange={showGlobe} warm={warm(GlobePanel.preload)} />
  return (
    <>
      <div className="lswap" key={String(globe)}>
      {globe ? (
        <Suspense fallback={<GlobeHold bar={bar} />}>
          <GlobePanel rows={rows} clock={now} online={n} bar={bar} pulse={pulseClass} minutes={seriesAt(data, stream.visits, now)} beat={beat} site={site} onVisitor={onVisitor} />
        </Suspense>
      ) : (
      <div className="liveview" role="region" aria-label={copy.live}>
        <Announce visits={stream.visits} />
        <section className="mk-card lnow" ref={ref} data-fit={fit}>
          <div className="lhead">
            <span key={beat} className={`mk-pulse ${pulseClass}`} />
            <span className="lt">{copy.live}</span>
            <span className="mk-quiet lm">{copy.window(at(now))}</span>
            <ChartSwitch mode={mode} onChange={pick} />
            {bar}
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
          {!isShared() && !feed.sample && (
            <Suspense fallback={null}>
              <MentionChip site={site} domain={whole?.domain} />
            </Suspense>
          )}
          {down && (
            <div className={`downbox${checkOnly ? ' warn' : ''}`}>
              {(checkOnly ? copy.checkBox : copy.downBox)(at(downSince * 1000), plainSpan((now - downSince * 1000) / 1000))}{' '}
              <WhyInline why={whyDown({ domain: whole?.domain ?? '', cause: whole?.down_cause, minutes: 0, ongoing: true })} />
            </div>
          )}
          <MinuteChart bars={bars} mode={mode} total={visitors30(data.visitors, online)} beat={beat} minute={Math.floor(now / 60_000)} phone={phone} timezone={timezone} label={(ago) => at(now - ago * 60_000)} />
          <div className="minl">
            <span>{copy.ago30}</span>
            <span>{copy.nowWord}</span>
          </div>
          <div className={`lbottom${data.revenue || askRevenue || holdRevenue ? ' money' : ''}`}>
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
              (askRevenue || holdRevenue) && whole && (
                <div className="lrev" style={holdRevenue ? { visibility: 'hidden' } : undefined} aria-hidden={holdRevenue || undefined}>
                  <span className="ll">{copy.revenueToday}</span>
                  <RevenueLock provider={want.paidWith} go={copy.connect} onGo={() => openSettings(whole, 'payments')} onHow={() => window.open(DOCS, '_blank', 'noopener')} />
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
          <FeedList key={site} rows={rows} up={upSources} clock={now} empty={down && !checkOnly ? copy.nobodyDown : copy.nobody} onVisitor={onVisitor} cookieless={whole?.cookieless} />
        </section>
      </div>
      )}
      </div>
      {!globe && (
        <div className="lcards" ref={cardsRef}>
          <AnalyticsCard today={data.today} lists={day === null ? lists : day} />
          {whole && !feed.sample && !isShared() && <HealthCards site={whole} now={now} downSince={downSince} near={cardsNear} />}
        </div>
      )}
    </>
  )
}
