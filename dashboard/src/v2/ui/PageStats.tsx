// The figures of a page that is not Live or the Briefing: the one summary card, in a row.
import type { ReactNode } from 'react'
import { SummaryCards } from './SummaryCards'

export interface PageStat {
  label: ReactNode
  value: string
}

export function PageStats({ items }: { items: PageStat[] }) {
  return <SummaryCards items={items.map((s, i) => ({ key: String(i), label: s.label, val: s.value }))} />
}
