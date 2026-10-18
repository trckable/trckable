// The figures of a page that is not Live or the Briefing, in one quiet row: a small name (with its explanation behind an
// (i) when it has one) over the number, set as the dashboard's numbers are.
import type { ReactNode } from 'react'
import './pageStats.css'

export interface PageStat {
  label: ReactNode
  value: string
}

export function PageStats({ items }: { items: PageStat[] }) {
  return (
    <dl className="ps-stats">
      {items.map((s, i) => (
        <div key={i}>
          <dt>{s.label}</dt>
          <dd>{s.value}</dd>
        </div>
      ))}
    </dl>
  )
}
