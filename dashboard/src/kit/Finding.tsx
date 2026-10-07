// Two sentence cards. Finding: the question on the top line and one big sentence
// whose number is highlighted (the number goes in `children` as <b>). InsightText:
// a plain sentence with the avatars of its sources underneath.
import type { ReactNode } from 'react'
import { Card } from './Card'

/** `foot` sits under the sentence: a line of context, a link. */
export function Finding({ tag, icon, tone, onOpen, foot, className = '', children }: { tag: ReactNode; icon?: ReactNode; tone?: 'good' | 'warn' | 'bad'; onOpen?: () => void; foot?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Card icon={icon} tone={tone} className={`kit-finding ${className}`} title={tag} onOpen={onOpen}>
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
