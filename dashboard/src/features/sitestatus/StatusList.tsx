// What the foot's status opens: the sites that stopped (down first, then quiet). One site opens its panel
// at once; several are a short list, each row opening its own panel, with a way back.
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import type { Site } from '../../lib/api'
import { StateDot } from '../sites/StateDot'
import { copy } from './copy'
import { StatusPanel } from './StatusCard'
import { statusOf } from './status'
import { silence, span } from './time'

const age = (s: Site) => (s.down_since ? span(Date.now() / 1000 - s.down_since) : silence(s))

export default function StatusList({ sites }: { sites: Site[] }) {
  const [pick, setPick] = useState<Site | null>(sites.length === 1 ? sites[0] : null)
  if (!pick) {
    return (
      <ul className="status-list">
        {sites.map((s) => (
          <li key={s.id}>
            <button type="button" className="status-row" data-nav onClick={() => setPick(s)}>
              <StateDot site={s} />
              <b>{s.name || s.domain}</b>
              <span className="faint">{copy.badge(statusOf(s) === 'down', age(s))}</span>
            </button>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <>
      {sites.length > 1 && (
        <button type="button" className="btn ghost status-back" data-nav onClick={() => setPick(null)}>
          <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
          {copy.listBack}
        </button>
      )}
      <StatusPanel site={pick} last={pick.last_event_at ?? 0} down={statusOf(pick) === 'down'} />
    </>
  )
}
