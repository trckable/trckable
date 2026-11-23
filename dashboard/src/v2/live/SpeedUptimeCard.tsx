// Live's Speed & uptime card: how fast the pages load as a gauge, and the last thirty days as a strip of days. A site
// that is down says so in red here as it does in the header and the incident record.
import { tag } from '../../i18n'
import { MIN_VITALS, type Site } from '../../lib/api'
import { dateFmt, fmtFixed } from '../../lib/format'
import { navigate } from '../../lib/url'
import { openExplore } from '../explore/open'
import { copy } from './copy'
import { EmptyBlock } from './EmptyBlock'
import { CardSkeleton } from './CardSkeleton'
import { BANDS, pausedWords, speedGrade, type Speed } from './health'
import { loading, type Health } from './useHealth'
import { plainSpan } from '../../lib/plainSpan'
import { downStateOf } from '../../features/sitestatus/status'
import './liveUptime.css'
import type { DayState } from '../../features/incidents/model'

const h = copy.health

/** A point on the half circle at a share (0 to 1) of the way round, in a box 200 wide. */
const at = (t: number, r: number): [number, number] => [100 + r * Math.cos(Math.PI * (1 - t)), 100 - r * Math.sin(Math.PI * (1 - t))]

function Gauge({ v, kind }: { v: number; kind: Speed['kind'] }) {
  // The gauge runs to the far end of the figure's bands; its zones follow the grades.
  const [good, mid, max] = BANDS[kind]
  const zones: { from: number; to: number; cls: string }[] = [
    { from: 0, to: good / max, cls: 'good' },
    { from: good / max, to: mid / max, cls: 'mid' },
    { from: mid / max, to: 1, cls: 'poor' },
  ]
  const [nx, ny] = at(Math.min(v / max, 1), 86)
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
const clock = (ms: number, tz: string) => dateFmt(tag, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(ms))

function incidents(site: Site) {
  navigate(`/${encodeURIComponent(site.domain)}/incidents`)
}

const speedAction = { label: h.turnOnSpeed, setup: 'speed' as const, ask: h.askSpeed }

/** Speed with no figure: off, one button turns it on; on, it is only waiting for visits. */
function SpeedEmpty({ site, speed, recorded, both }: { site: Site; speed?: Speed | null; recorded?: boolean; both?: boolean }) {
  const off = both ? h.empty.both : h.empty.speed
  const line = recorded ? h.empty.readings(speed?.n ?? 0, MIN_VITALS) : off
  // Enough people but few readings: say why (iPhones report none), so the count is not read as a broken card.
  const note = recorded && (speed?.people ?? 0) >= MIN_VITALS ? h.iphoneNote : undefined
  return <EmptyBlock site={site} line={line} note={note} ghost={both ? ['gauge', 'strip'] : ['gauge']} action={recorded ? undefined : speedAction} collecting={recorded} />
}

function SpeedBlock({ site, speed, recorded }: { site: Site; speed?: Speed | null; recorded?: boolean }) {
  // Switched on but too few visits: nothing to set up, only to wait for. (Uptime has no switch: every site is probed.)
  if (speed?.sec == null) return <SpeedEmpty site={site} speed={speed} recorded={recorded} />
  const grade = speedGrade(speed.kind, speed.sec)
  return (
    <button type="button" className="lhspeed" onClick={() => openExplore('speed')}>
      <Gauge v={speed.sec} kind={speed.kind} />
      <b className="lhn">{h.sec(fmtFixed(speed.sec, 1))}</b>
      <span className={`lhgrade ${grade}`}>{h.grades[grade]}</span>
      {speed.kind === 'fcp' && <span className="lhwhat">{h.fcpLabel}</span>}
      {speed.kind === 'fcp' && <span className="lhnote">{h.fcpNote(speed.n)}</span>}
    </button>
  )
}

function UptimeBlock({ site, up, down }: { site: Site; up?: Health['uptime']; down: boolean }) {
  const days = up ? up.days.map((d, i) => (down && i === up.days.length - 1 ? ('down' as const) : d)) : undefined
  if (!days || (!down && !site.uptime_paused && up?.pct == null)) return down ? null : <EmptyBlock site={site} line={h.empty.uptime} ghost={['strip']} collecting />
  const share = up?.pct != null ? h.upIn(h.pct(fmtFixed(up.pct, 1))) : h.days30
  const axis = site.uptime_paused ? pausedWords : share
  return (
    <button type="button" className="lhup" onClick={() => incidents(site)}>
      <Strip days={days} />
      <span className="lhaxis">
        <span>{axis}</span>
        <span>{copy.nowWord}</span>
      </span>
    </button>
  )
}

function DownBody({ site, since, health }: { site: Site; since: number; health: Health }) {
  const checkOnly = downStateOf(site) === 'visitors'
  return (
    <>
      <button type="button" className={`lhbig ${checkOnly ? 'warn' : 'bad'}`} onClick={() => incidents(site)}>
        <b>{checkOnly ? h.checkFails : h.down}</b>
        <span>{(checkOnly ? h.checkSince : h.downSince)(clock(since * 1000, site.timezone), site.down_cause ?? '')}</span>
      </button>
      <UptimeBlock site={site} up={health.uptime} down />
    </>
  )
}

function UpBody({ site, health }: { site: Site; health: Health }) {
  // Neither half has a figure: one message and one button for the card, not two stacked.
  if (health.speed?.sec == null && (health.uptime?.pct ?? null) === null) {
    return <SpeedEmpty site={site} speed={health.speed} recorded={health.vitalsOn} both />
  }
  return (
    <>
      <SpeedBlock site={site} speed={health.speed} recorded={health.vitalsOn} />
      <UptimeBlock site={site} up={health.uptime} down={false} />
    </>
  )
}

function body(site: Site, health: Health, downSince?: number) {
  if (downSince !== undefined) return <DownBody site={site} since={downSince} health={health} />
  return loading(health) ? <CardSkeleton kind="speed" /> : <UpBody site={site} health={health} />
}

export function SpeedUptimeCard({ site, health, now, downSince }: Props) {
  const down = downSince !== undefined
  const span = down ? plainSpan((now - downSince * 1000) / 1000) : ''
  const checkOnly = down && downStateOf(site) === 'visitors'
  let tone = ''
  if (down) tone = checkOnly ? ' warn' : ' bad'
  return (
    <section className={`mk-card lcard lhc${tone}`} aria-label={h.speedUptime}>
      <div className="ph">
        <span className={down ? 'lhdown' : 't'}>{down ? (checkOnly ? h.checkFor : h.downFor)(span) : h.speedUptime}</span>
      </div>
      <div className="pb lhbody">{body(site, health, downSince)}</div>
    </section>
  )
}
