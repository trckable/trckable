// Live, in the walkthrough's own layout: the half hour as bars with who is here now, the people on the site, and under
// them Today, the pages and the countries. The numbers are the server's last half hour and the stream's newer visits.
import { Suspense, useEffect, useMemo } from 'react'
import { lazyLoad } from '../../lib/lazyLoad'
import { onlineNow } from '../../lib/live'
import { isShared, isViewer } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { fmtInt } from '../../lib/format'
import { channelColor, channelLabel } from '../../lib/palette'
import type { Site } from '../../lib/api'
import { BusyLine } from '../ui/BusyLine'
import { WhyInline } from '../ui/WhyInline'
import { whyDown } from '../briefing/why'
import { liveCount, liveLink } from '../../features/live/liveLink'
import { feedOf, seriesAt } from '../../features/live/model'
import type { Busier, LiveNow } from '../../features/live/api'
import { useTicking } from '../../features/live/useTicking'
import { FeedList } from '../ui/FeedList'
import { Rng } from '../ui/RangeBar'
import { barsOf, changeOf, listsOf, sourceParts, todayBand } from './liveModel'
import { LiveSpark } from './LiveSpark'
import { LockMini } from './LockMini'
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
  /** Visitors on each of the last seven days. */
  week: number[]
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
  const { data, failed, got, clock, skew, busier, week, downSince, colors } = feed
  const now = useTicking(clock, skew)
  useEffect(() => {
    liveLink.set(stream.connected)
    return () => liveLink.set(true)
  }, [stream.connected])
  const online = onlineNow(stream, data?.online, data?.online, got) ?? null
  useEffect(() => liveCount.set(online), [online])
  const rows = useMemo(() => (data ? feedOf(data.recent, stream.visits, data.at, now) : []), [data, stream.visits, now])
  const lists = useMemo(() => listsOf(rows), [rows])
  const upSources = useMemo(() => new Set((busier?.why ?? []).filter((w) => w.dim === 'source').map((w) => w.value)), [busier])
  if (!data) return <div className="liveview" role="region" aria-label={copy.live}><p className="mk-quiet">{failed ? copy.failed : copy.loading}</p></div>
  const n = online ?? 0
  const bars = barsOf(seriesAt(data, stream.visits, now))
  const ch = changeOf(data.visitors, data.previous)
  const src = sourceParts(data.sources)
  const tb = data.today ? todayBand(data.today.visitors, data.today.before, data.today.compare) : null
  const down = downSince !== undefined
  const at = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone })
  const colorOf = (channel: string) => colors?.[channel] ?? channelColor(channel)
  return (
    <>
      <div className="liveview" role="region" aria-label={copy.live}>
        <section className="mk-card lnow">
          <div className="lhead">
            <span className={`mk-pulse ${down || !stream.connected ? 'off' : ''}`} />
            <span className="lt">{copy.live}</span>
            <span className="mk-quiet lm">{copy.window(at(now))}</span>
          </div>
          <div className="lfig">
            <div>
              <span className="ll">{copy.onlineNow}</span>
              <b className="lbign">{fmtInt(n)}</b>
            </div>
            <div>
              <span className="ll">{copy.visitors30}</span>
              <b className="lbign">{fmtInt(data.visitors)}</b>
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
          <div className="mins" role="img" aria-label={copy.minsLabel(data.visitors)}>
            {bars.map((b, i) => (
              <i key={i} className={b.z ? 'z' : ''} style={{ height: `${b.h}%` }} />
            ))}
          </div>
          <div className="minl">
            <span>{copy.ago30}</span>
            <span>{copy.nowWord}</span>
          </div>
          <div className={`lbottom${data.revenue || !isViewer() ? ' money' : ''}`}>
            <div className="lsrc">
              <span className="ll">{copy.topSources}</span>
              {src.parts.length > 0 ? (
                <>
                  <div className="lsplit">
                    {src.parts.map((p) => (
                      <span key={p.channel} title={channelLabel(p.channel)} style={{ flexGrow: p.grow, background: colorOf(p.channel) }} />
                    ))}
                    {src.other > 0.02 && <span className="oth" style={{ flexGrow: src.other }} />}
                  </div>
                  <ul className="llegend">
                    {src.parts.map((p) => (
                      <li key={p.channel}>
                        <span className="lg">
                          <i style={{ background: colorOf(p.channel) }} />
                          {channelLabel(p.channel)}
                          <b>{p.pct}%</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="mk-quiet" style={{ marginTop: 8 }}>
                  {copy.noVisitors}
                </div>
              )}
            </div>
            {data.revenue ? (
              <div className="lrev">
                <span className="ll">{copy.revenueToday}</span>
                <b className="lmoney">{new Intl.NumberFormat(undefined, { style: 'currency', currency: data.revenue.currency, maximumFractionDigits: data.revenue.exponent ? 2 : 0 }).format(data.revenue.amount / 10 ** data.revenue.exponent)}</b>
              </div>
            ) : (
              whole &&
              !isViewer() &&
              !isShared() && (
                <div className="lrev">
                  <span className="ll">{copy.revenueToday}</span>
                  <LockMini onConnect={() => openSettings(whole, 'payments')} onHow={() => openSettings(whole, 'payments')} />
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
          <FeedList rows={rows} up={upSources} clock={now} more={Math.max(0, n - rows.length)} empty={down ? copy.nobodyDown : copy.nobody} onVisitor={onVisitor} />
        </section>
      </div>
      <div className="lcards">
        {data.today && data.today.visitors > 0 && (
          <section className="mk-card lcard">
            <div className="ph">
              <span className="t">{copy.today}</span>
              {tb && <span className="mk-quiet">{tb.word === 'usual' ? copy.usualWord : copy[tb.word]}</span>}
            </div>
            <div className="pb">
              <div className="lbig">
                {fmtInt(data.today.visitors)}
                <small>{copy.visitors}</small>
              </div>
              {tb && (
                <>
                  <Rng v={data.today.visitors} lo={tb.lo} hi={tb.hi} max={tb.max} />
                  <div className="mk-n">{copy.usual(tb.lo, tb.hi)}</div>
                </>
              )}
              {week.length > 1 && (
                <>
                  <div className="mk-n" style={{ marginTop: 'var(--mk-s4)' }}>{copy.last7}</div>
                  <LiveSpark vals={week} />
                </>
              )}
            </div>
          </section>
        )}
        {lists.pages.length > 0 && (
          <section className="mk-card lcard">
            <div className="ph">
              <span className="t">{copy.pages}</span>
            </div>
            <div className="pb">
              {lists.pages.map((p) => (
                <div className="lr" key={p.label}>
                  <span className="mono">{p.label}</span>
                  <b>{p.n}</b>
                </div>
              ))}
            </div>
          </section>
        )}
        {lists.countries.length > 0 && (
          <section className="mk-card lcard">
            <div className="ph">
              <span className="t">{copy.countries}</span>
            </div>
            <div className="pb">
              {lists.countries.map((c) => (
                <div className="lr" key={c.key}>
                  <span>{c.label}</span>
                  <b>{c.n}</b>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
