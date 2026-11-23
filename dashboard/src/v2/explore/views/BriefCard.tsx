// One card of the Briefing: the shared card with its title, whatever the card says inside.
import type { ReactNode } from 'react'

export function BriefCard({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="xcp xbr-card" data-briefing={id}>
      <h3 className="xcp-h">{title}</h3>
      <div className="xcp-b">{children}</div>
    </section>
  )
}
