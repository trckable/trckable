// Live's Speed & uptime card: how fast the pages load as a gauge, and the last thirty days as a strip of days. A site
// that is down says so in red here as it does in the header and the incident record.
import { tag } from '../../i18n'
import type { Site } from '../../lib/api'
import { fmtFixed } from '../../lib/format'
import { navigate } from '../../lib/url'
import { gradeOf } from '../explore/data/mapSections'
import { openExplore } from '../explore/open'
import { copy } from './copy'
import { EmptyBlock } from './EmptyBlock'
import type { Health } from './useHealth'
import type { DayState } from '../../features/incidents/model'

const h = copy.health
const MAX = 5 // the gauge runs to five seconds; zones follow the grades (fast to 2.5, OK to 4)

/** A point on the half circle at a share (0 to 1) of the way round, in a box 200 wide. */
const at = (t: number, r: number): [number, number] => [100 + r * Math.cos(Math.PI * (1 - t)), 100 - r * Math.sin(Math.PI * (1 - t))]

function Gauge({ v }: { v: number }) {
  const zones: { from: number; to: number; cls: string }[] = [
    { from: 0, to: 0.5, cls: 'good' },
    { from: 0.5, to: 0.8, cls: 'mid' },
    { from: 0.8, to: 1, cls: 'poor' },
  ]
  const [nx, ny] = at(Math.min(v / MAX, 1), 86)
  return (
    <svg className="lhgauge" viewBox="0 0 200 108" role="img" aria-label={h.sec(fmtFixed(v, 1))}>
      {zones.map((z) => {
        const [x0, y0] = at(z.from + 0.005, 86)
        const [x1, y1] = at(z.to - 0.005, 86)
        return <path key={z.cls} className={`lhz ${z.cls}`} d={`M${x0} ${y0} A86 86 0 0 1 ${x1} ${y1}`} />
      })}
      <circle className="lhknob" cx={nx} cy={ny} r="8" />
    </svg>
  )
}

function Strip({ days }: { days: DayState[] }) {
  return (
    <div className="lhstrip" role="img" aria-label={h.days30}>
      {days.map((d, i) => (
        <i key={i} className={d === 'ok' ? '' : d} />
      ))}
    </div>
  )
}

interface Props {
  site: Site
  health: Health
  /** The clock Live runs by (ms), for how long a site has been down. */
  now: number
  /** Unix seconds the site stopped answering, while it is down. */
  downSince?: number
}

/** The clock time in the site's own zone. */
const clock = (ms: number, tz: string) => new Date(ms).toLocaleTimeString(tag ?? [], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })

function incidents(site: Site) {
  navigate(`/${encodeURIComponent(site.domain)}/incidents`)
}

function SpeedBlock({ site, speed, recorded }: { site: Site; speed?: number | null; recorded?: boolean }) {
  // Switched on but too few visits: nothing to set up, only to wait for.
  if (speed == null) return <EmptyBlock site={site} line={recorded ? h.empty.speedFew : h.empty.speed} setup={recorded ? undefined : 'speed'} waiting={speed === undefined} reserve={132} />
  const grade = gradeOf(0, speed)
  return (
    <button type="button" className="lhspeed" onClick={() => openExplore('speed')}>
      <Gauge v={speed} />
      <b className="lhn">{h.sec(fmtFixed(speed, 1))}</b>
      <span className={`lhgrade ${grade}`}>{h.grades[grade]}</span>
    </button>
  )
}

function UptimeBlock({ site, up, down }: { site: Site; up?: Health['uptime']; down: boolean }) {
  const days = up ? up.days.map((d, i) => (down && i === up.days.length - 1 ? ('down' as const) : d)) : undefined
  if (!days || (!down && up?.pct == null)) return down ? null : <EmptyBlock site={site} line={h.empty.uptime} waiting={up === undefined} reserve={64} />
  return (
    <button type="button" className="lhup" onClick={() => incidents(site)}>
      <Strip days={days} />
      <span className="lhaxis">
        <span>{up?.pct != null ? h.upIn(h.pct(fmtFixed(up.pct, 1))) : h.days30}</span>
        <span>{copy.nowWord}</span>
      </span>
    </button>
  )
}

export function SpeedUptimeCard({ site, health, now, downSince }: Props) {
  const down = downSince !== undefined
  const minutes = down ? Math.max(0, Math.round((now - downSince * 1000) / 60_000)) : 0
  return (
    <section className={`mk-card lcard lhc${down ? ' bad' : ''}`} aria-label={h.speedUptime}>
      <div className="ph">
        <span className={down ? 'lhdown' : 't'}>{down ? h.downFor(minutes) : h.speedUptime}</span>
      </div>
      <div className="pb lhbody">
        {down ? (
          <button type="button" className="lhbig bad" onClick={() => incidents(site)}>
            <b>{h.down}</b>
            <span>{h.downSince(clock(downSince * 1000, site.timezone), site.down_cause ?? '')}</span>
          </button>
        ) : (
          <SpeedBlock site={site} speed={health.speed} recorded={health.vitalsOn} />
        )}
        <UptimeBlock site={site} up={health.uptime} down={down} />
      </div>
    </section>
  )
}
