// One goal, told: how many times, a usual day, where from, why it stands out (or "As usual."), and each time it happened.
// The goal's own page in Explore and the bell's goal card both draw it from the same answer.
import { Activity, Check } from 'lucide-react'
import { Loading } from '../../components/loading/Loading'
import { XError } from '../ui/XBits'
import { SummaryCards, type SumItem } from '../ui/SummaryCards'
import { useLoad } from '../explore/data/useLoad'
import { dayOf, timeOf } from '../bell/days'
import { dayWords } from '../dayWords'
import { deviceName } from '../../lib/deviceName'
import { countryName, fmtInt } from '../../lib/format'
import { more, type GoalPage, type GoalWho, type Site } from '../../lib/apiMore'
import { DeviceIcon, PlaceIcon, SourceIcon } from './goalMarks'
import { fmtUsual, sourceWords, whyOf } from './standing'
import { stand } from './standCopy'
import './standing.css'

/** One goal over a period, read from the server; the key names the question, so a new one drops the old answer. */
export function useGoalPage(site: string, goal: string, from: string, to: string) {
  return useLoad<GoalPage>(`goal|${site}|${goal}|${from}|${to}`, (signal) => more.goalPage(site, goal, { from, to }, signal), true)
}

function whenOf(w: GoalWho, zone: string | undefined, withDay: boolean): string {
  const time = timeOf(w.at, zone)
  return withDay ? `${dayWords(dayOf(w.at, zone))} ${time}` : time
}

const countryOf = (w: GoalWho): string => (w.country ? countryName(w.country) : '')
const deviceOf = (w: GoalWho): string => (w.device ? deviceName({ device: w.device, os: w.os }) : '')

/** A side card of the goal's own page: who sent them, or the pages they were reached on. */
function Top({ title, rows, words }: { title: string; rows: { source: string; count: number }[]; words: (s: string) => string }) {
  return (
    <section className="gs-top">
      <h3 className="gs-h">{title}</h3>
      {rows.map((r) => (
        <div key={r.source} className="gs-top-row">
          <span className="gs-wrap" title={words(r.source)}>{words(r.source)}</span>
          <span className="gs-dim">{fmtInt(r.count)}</span>
        </div>
      ))}
    </section>
  )
}

/** The goal's own page: a time, the page, who sent them, and where from, in words. The page gets the most room; on a phone the
 *  time and page are one line and who and where the line under it, so nothing is cut. */
function Time({ w, zone, withDay }: { w: GoalWho; zone?: string; withDay: boolean }) {
  const place = [countryOf(w), deviceOf(w)].filter(Boolean).join(' · ')
  return (
    <li className="gs-time">
      <span className="gs-when">{whenOf(w, zone, withDay)}</span>
      <span className="gs-cell gs-path" title={w.path}>{w.path ?? ''}</span>
      <span className="gs-meta">
        <span className="gs-cell gs-dim" title={sourceWords(w.source)}>{sourceWords(w.source)}</span>
        <span className="gs-cell gs-dim" title={place}>{place}</span>
      </span>
    </li>
  )
}

/** The bell's card: a slim row of marks, the page only when it is not the home page. */
function SlimTime({ w, zone, paths }: { w: GoalWho; zone?: string; paths: boolean }) {
  const path = w.path && w.path !== '/' ? w.path : ''
  return (
    <li className="gs-time gs-slim">
      <span className="gs-when">{whenOf(w, zone, false)}</span>
      <SourceIcon source={w.source} />
      <span className="gs-cell gs-path" title={path || undefined}>{paths ? path : ''}</span>
      <PlaceIcon country={w.country} />
      <DeviceIcon device={w.device} os={w.os} />
    </li>
  )
}

/** One tile of the card's row: the number and what it counts. */
function Chip({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="gs-chip" title={title}>
      {icon}
      {children}
    </span>
  )
}

/** `wide`: the goal's own page, with who sent them and the pages beside the times. Else the bell's card: three slim chips and slim rows. */
export function GoalFacts({ page, zone, label, withDay, wide }: { page: GoalPage; zone?: string; label: string; withDay: boolean; wide?: boolean }) {
  const g = page.goal
  const top = page.sources[0]
  const from = top ? sourceWords(top.source) : '–'
  const tiles: SumItem[] = [
    { key: 'n', label: <span>{label}</span>, val: fmtInt(g.count) },
    { key: 'usual', label: <span>{stand.tileUsual}</span>, val: fmtUsual(g.usual) },
    { key: 'from', label: <span>{stand.tileFrom}</span>, val: from },
  ]
  const paths = page.events.some((w) => w.path && w.path !== '/')
  const times =
    page.events.length === 0 ? (
      <p className="gs-empty">{stand.noTimes}</p>
    ) : (
      <ol className={wide ? 'gs-times gs-times-wide' : 'gs-times'}>
        {page.events.map((w, i) => (wide ? <Time key={i} w={w} zone={zone} withDay={withDay} /> : <SlimTime key={i} w={w} zone={zone} paths={paths} />))}
        {g.count > page.events.length && <li className="gs-empty">{stand.more(fmtInt(g.count - page.events.length))}</li>}
      </ol>
    )
  if (!wide)
    return (
      <div className="gs-facts gs-card-facts">
        <div className="gs-chips">
          <Chip title={label} icon={<Check size={13} aria-hidden="true" />}>
            <b>{fmtInt(g.count)}</b>
            {label}
          </Chip>
          <Chip title={stand.tileUsual} icon={<Activity size={13} aria-hidden="true" />}>
            <b>{fmtUsual(g.usual)}</b>
            {stand.tileUsual}
          </Chip>
          <Chip title={`${stand.tileFrom} ${from}`} icon={top ? <SourceIcon source={top.source} /> : null}>
            {stand.tileFrom}
            <b>{from}</b>
          </Chip>
        </div>
        <p className={`gs-why${g.out ? ' out' : ''}`} title={whyOf(g)}>{whyOf(g)}</p>
        <h3 className="gs-h">{stand.each}</h3>
        <div className="gs-times-box">{times}</div>
      </div>
    )
  const aside = page.sources.length > 0 || page.paths.length > 0
  return (
    <div className="gs-facts">
      <div className="mk gs-tiles">
        <SummaryCards items={tiles} />
      </div>
      <p className={`gs-why${g.out ? ' out' : ''}`}>{whyOf(g)}</p>
      <div className={aside ? 'gs-grid' : undefined}>
        <div className="gs-times-box">
          <h3 className="gs-h">{stand.each}</h3>
          {times}
        </div>
        {aside && (
          <div className="gs-aside">
            {page.sources.length > 0 && <Top title={stand.cameFrom} rows={page.sources} words={sourceWords} />}
            {page.paths.length > 0 && <Top title={stand.onPage} rows={page.paths} words={(s) => s || '/'} />}
          </div>
        )}
      </div>
    </div>
  )
}

/** The goal read for one site and stretch, with its loading and failing shapes. */
export function GoalRead({ site, goal, from, to, label, withDay, children }: { site: Site; goal: string; from: string; to: string; label: string; withDay: boolean; children?: (p: GoalPage) => React.ReactNode }) {
  const r = useGoalPage(site.id, goal, from, to)
  if (r.state === 'loading') return <Loading height={160} label={stand.loading} />
  if (r.state === 'error') return <XError title={stand.failed} hint={r.message} onRetry={r.retry} />
  return (
    <>
      <GoalFacts page={r.data} zone={site.timezone} label={label} withDay={withDay} />
      {children?.(r.data)}
    </>
  )
}
