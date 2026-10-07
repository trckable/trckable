// One card under Live: the whole card opens something in Data, and the rows
// inside it open something narrower. The title is the card's button; a quiet
// ↗ marks that it goes somewhere.
import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cardsCopy } from './cardsCopy'

export function LiveCard({ title, icon, onOpen, children }: { title: string; icon: ReactNode; onOpen: () => void; children: ReactNode }) {
  return (
    <section className="card lv-card">
      <h3 className="lv-title">
        {icon}
        <button type="button" className="lv-stretch" onClick={onOpen} aria-label={cardsCopy.open(title)}>
          {title}
        </button>
      </h3>
      <span className="lv-go" aria-hidden="true">
        <ArrowUpRight size={14} strokeWidth={2} />
      </span>
      {children}
    </section>
  )
}
