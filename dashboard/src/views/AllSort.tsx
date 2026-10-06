// "Sort: Switcher order ▾": a quiet choice at the right of the filter row.
import { ChevronDown } from 'lucide-react'
import { copy as sites } from '../features/sites/menuCopy'
import { copy } from './allSitesCopy'
import { type OrderKey, ORDERS } from './allSitesLogic'

export function AllSort({ value, onChange }: { value: OrderKey; onChange: (k: OrderKey) => void }) {
  const label: Record<OrderKey, string> = { order: sites.yourOrder, visitors: copy.byVisitors, name: copy.byName }
  return (
    <label className="all-sort">
      <span className="faint" aria-hidden="true">
        {copy.sort('')}
      </span>
      <select aria-label={copy.sortLabel} value={value} onChange={(e) => onChange(e.target.value as OrderKey)}>
        {ORDERS.map((k) => (
          <option key={k} value={k}>
            {label[k]}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  )
}
