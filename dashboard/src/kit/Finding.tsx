// Two sentence cards. Finding: an accent glow, a tag chip and one big sentence
// whose number is highlighted (the number goes in `children` as <b>). InsightText:
// a plain sentence with the avatars of its sources underneath.
import type { ReactNode } from 'react'
import { Card } from './Card'

/** `foot` sits under the sentence: a line of context, a link. */
export function Finding({ tag, onOpen, foot, className = '', children }: { tag: ReactNode; onOpen?: () => void; foot?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Card variant="accent" className={`kit-finding ${className}`} title={<span className="kit-tagchip">{tag}</span>} onOpen={onOpen}>
      <span className="kit-ring r1" aria-hidden="true" />
      <span className="kit-ring r2" aria-hidden="true" />
      <p className="kit-say">{children}</p>
      {foot}
    </Card>
  )
}

export type Source = { key: string; label: string; initial: string; color: string; ink?: string }

export function InsightText({ title, onOpen, sources, children }: { title: ReactNode; onOpen?: () => void; sources?: Source[]; children: ReactNode }) {
  return (
    <Card title={title} onOpen={onOpen}>
      <p className="kit-text">{children}</p>
      {sources && sources.length > 0 && (
        <span className="kit-srcs">
          {sources.map((s) => (
            <span key={s.key} title={s.label} role="img" aria-label={s.label} style={{ background: s.color, color: s.ink }}>
              {s.initial}
            </span>
          ))}
        </span>
      )}
    </Card>
  )
}
