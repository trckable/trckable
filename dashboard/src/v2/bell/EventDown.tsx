// An outage: when it began and ended, how long, and what the checks saw (the incident record the Incidents page reads).
import { useState } from 'react'
import { Loading } from '../../components/loading/Loading'
import { fmtInt } from '../../lib/format'
import { copy as inc } from '../../features/incidents/copy'
import { usePeriodIncidents } from '../../features/incidents/useIncidents'
import { duration, lasted } from '../../features/incidents/model'
import type { Site } from '../../lib/api'
import { whenOf } from './days'
import { eventCopy as t } from './eventCopy'
import type { Notice } from './notices'

/** The incident the row tells: its id is the row's, after "down:". */
const idOf = (n: Notice): string => n.id.replace(/^down:/, '')

export function EventDown({ n, site }: { n: Notice; site: Site }) {
  const [now] = useState(() => Math.floor(Date.now() / 1000))
  const r = usePeriodIncidents(site.id, n.at - 1, now + 1)
  const x = r.list.find((i) => i.id === idOf(n))
  if (r.failed) return <p className="ev-note" role="alert">{t.failed}</p>
  if (!r.ready) return <Loading height={100} label={t.loading} />
  if (!x) return <p className="ev-note">{n.title}</p>
  return (
    <dl className="ev-facts">
      <dt>{t.started}</dt>
      <dd className="num">{whenOf(x.started_at, now)}</dd>
      <dt>{t.backUp}</dt>
      <dd className="num">{x.ended_at === null ? t.stillDown : whenOf(x.ended_at, now)}</dd>
      <dt>{x.ended_at === null ? t.soFar : t.lasted}</dt>
      <dd className="num">{duration(lasted(x, now))}</dd>
      <dt>{t.checks}</dt>
      <dd>{x.cause}</dd>
      {x.expected_visits !== null && (
        <>
          <dt />
          <dd>{inc.expected(fmtInt(x.expected_visits))}</dd>
        </>
      )}
    </dl>
  )
}
