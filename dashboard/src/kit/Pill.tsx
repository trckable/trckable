// The small rounded chip next to a number: ▲ 12% in green, ▼ 8% in red, or a
// quiet word. StatusTag is the same chip, smaller, for a table row.
import type { ReactNode } from 'react'
import type { Tone } from './model'
import './kit.css'

export function Pill({ tone = 'neutral', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <span className={`kit-pill ${tone}`} title={title}>
      {children}
    </span>
  )
}

export function StatusTag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`kit-tag ${tone}`}>{children}</span>
}
