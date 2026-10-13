// The period of All sites: a quiet button that opens the list of periods.
import { Check, ChevronDown } from 'lucide-react'
import { Popover } from '../kit'
import { copy } from './allSitesCopy'
import '../components/sheet.css'

export const PERIODS = [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 365, label: '12 months' }]

export function AllPeriod({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  const now = PERIODS.find((p) => p.days === days)
  return (
    <Popover
      label={copy.period}
      className="menu"
      trigger={(p) => (
        <button type="button" className="btn ghost all-period" {...p} aria-haspopup="menu" aria-label={copy.period}>
          {copy.last(now?.label ?? '')}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <div className="menu-list" role="menu" aria-label={copy.period}>
          {PERIODS.map((p) => (
            <button key={p.days} type="button" role="menuitemradio" aria-checked={p.days === days} onClick={() => { close(); onChange(p.days) }}>
              {copy.last(p.label)}
              {p.days === days && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}
