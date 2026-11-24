// One goal, told: how many times, a usual day, where from, why it stands out (or "As usual."), and each time it happened.
// The goal's own page in Explore and the bell's goal card both draw it from the same answer.
import { Loading } from '../../components/loading/Loading'
import { XError } from '../ui/XBits'
import { SummaryCards, type SumItem } from '../ui/SummaryCards'
import { useLoad } from '../explore/data/useLoad'
import { dayOf, timeOf } from '../bell/days'
import { dayWords } from '../dayWords'
import { deviceName } from '../../lib/deviceName'
import { countryName, fmtInt } from '../../lib/format'
import { more, type GoalPage, type GoalWho, type Site } from '../../lib/apiMore'
import { sourceName } from '../briefing/model'
import { fmtUsual, whyOf } from './standing'
import { stand } from './standCopy'
import './standing.css'

/** One goal over a period, read from the server; the key names the question, so a new one drops the old answer. */
export function useGoalPage(site: string, goal: string, from: string, to: string) {
  return useLoad<GoalPage>(`goal|${site}|${goal}|${from}|${to}`, (signal) => more.goalPage(site, goal, { from, to }, signal), true)
}

/** Who sent them, as people say it: the brand or host, "Direct" for none. */
export function sourceWords(s: string | undefined): string {
  if (!s || s === 'Direct') return stand.direct
  return s.includes('.') ? sourceName(s) : s
}

function whenOf(w: GoalWho, zone: string | undefined, withDay: boolean): string {
  const time = timeOf(w.at, zone)
  return withDay ? `${dayWords(dayOf(w.at, zone))} ${time}` : time
}

const place = (w: GoalWho): string => [w.country ? countryName(w.country) : '', w.device ? deviceName({ device: w.device, os: w.os }) : ''].filter(Boolean).join(' · ')

/** The goal's numbers, why, and the times; `label` names the count ("Today" or "Reached"), `withDay` puts the day before each time. */
export function GoalFacts({ page, zone, label, withDay }: { page: GoalPage; zone?: string; label: string; withDay: boolean }) {
  const g = page.goal
  const top = page.sources[0]
  const tiles: SumItem[] = [
    { key: 'n', label, val: fmtInt(g.count) },
    { key: 'usual', label: stand.tileUsual, val: fmtUsual(g.usual) },
    { key: 'from', label: stand.tileFrom, val: top ? sourceWords(top.source) : '–' },
  ]
  return (
    <div className="gs-facts">
      <div className="mk gs-tiles">
        <SummaryCards items={tiles} />
      </div>
      <p className={`gs-why${g.out ? ' out' : ''}`}>{whyOf(g)}</p>
      <h3 className="gs-h">{stand.each}</h3>
      {page.events.length === 0 ? (
        <p className="gs-empty">{stand.noTimes}</p>
      ) : (
        <ol className="gs-times">
          {page.events.map((w, i) => (
            <li key={i} className="gs-time">
              <span className="gs-when">{whenOf(w, zone, withDay)}</span>
              <span className="gs-cell" title={w.path}>{w.path ?? ''}</span>
              <span className="gs-cell gs-dim">{sourceWords(w.source)}</span>
              <span className="gs-cell gs-dim">{place(w)}</span>
            </li>
          ))}
        </ol>
      )}
      {g.count > page.events.length && <p className="gs-empty">{stand.more(fmtInt(g.count - page.events.length))}</p>}
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
