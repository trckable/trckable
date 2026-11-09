// What the foot's status and the site menu's bar open: the sites that stopped (down first, then quiet), a short list.
// While a report is open the panel the list sits in steps out of its way (StatusCard.css). A row opens that site's report in a modal (StatusModal); a single site is still a row, never an inline panel.
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Site } from '../../lib/api'
import { StateDot } from '../sites/StateDot'
import { copy } from './copy'
import { statusOf } from './status'
import { plainSpan } from '../../lib/plainSpan'
import { silence } from './time'
import './StatusCard.css'

const StatusModal = lazy(() => import('./StatusModal'))

const age = (s: Site) => (s.down_since ? plainSpan(Date.now() / 1000 - s.down_since) : silence(s))

export default function StatusList({ sites }: { sites: Site[] }) {
  const [pick, setPick] = useState<Site | null>(null)
  // The row that opened the report: its panel is out of sight while the report is open, so focus goes back to it by hand once it closes.
  const from = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!pick) from.current?.focus()
  }, [pick])
  return (
    <>
      <ul className={pick ? 'status-list picked' : 'status-list'}>
        {sites.map((s) => (
          <li key={s.id}>
            <button type="button" className="status-row" data-nav aria-haspopup="dialog" onClick={(e) => {
                from.current = e.currentTarget
                setPick(s)
              }}>
              <StateDot site={s} />
              <b>{s.name || s.domain}</b>
              <span className="faint">{copy.badge(statusOf(s) === 'down', age(s))}</span>
            </button>
          </li>
        ))}
      </ul>
      {pick && (
        <Suspense fallback={null}>
          <StatusModal site={pick} onClose={() => setPick(null)} />
        </Suspense>
      )}
    </>
  )
}
