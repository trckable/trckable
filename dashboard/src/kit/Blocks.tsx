// The smaller card bodies: three figures side by side, one huge number on a
// glow, proportional blocks, and hatched columns with the share inside.
import type { ReactNode } from 'react'
import { Card } from './Card'
import { kitWords } from './copy'
import { Pill } from './Pill'
import { clampPct, type Tone } from './model'

export function StatTrio({ items }: { items: { key: string; label: ReactNode; value: ReactNode; pill?: { text: ReactNode; tone?: Tone } }[] }) {
  return (
    <div className="kit-trio">
      {items.map((it) => (
        <div key={it.key}>
          <span className="kit-sub">{it.label}</span>
          <span className="kit-val small">
            <b className="num">{it.value}</b>
            {it.pill && <Pill tone={it.pill.tone}>{it.pill.text}</Pill>}
          </span>
        </div>
      ))}
    </div>
  )
}

export function HeroNumber({ title, value, pill, sub, onOpen }: { title: ReactNode; value: ReactNode; pill?: { text: ReactNode; tone?: Tone }; sub?: ReactNode; onOpen?: () => void }) {
  return (
    <Card title={title} onOpen={onOpen} variant="hero">
      <span className="kit-hero-num">
        <b className="num">{value}</b>
        {pill && <Pill tone={pill.tone ?? 'good'}>{pill.text}</Pill>}
      </span>
      {sub && <span className="kit-sub">{sub}</span>}
    </Card>
  )
}

export type Split = { key: string; label: ReactNode; share: number; color?: string }

export function SplitBlocks({ title, items, onOpen }: { title: ReactNode; items: Split[]; onOpen?: () => void }) {
  return (
    <Card title={title} onOpen={onOpen}>
      <div className="kit-blocks">
        {items.map((it) => (
          <div key={it.key}>
            <span className="kit-sub">
              <i className="kit-dot" style={{ background: it.color }} />
              {it.label}
            </span>
            <b className="num">{kitWords.pct(Math.round(clampPct(it.share)))}</b>
            <i className="kit-blk" style={{ background: it.color, height: 20 + clampPct(it.share) * 0.5 }} />
          </div>
        ))}
      </div>
    </Card>
  )
}

export type Col = { key: string; label: string; pct: number; color?: string; ink?: string }

export function Columns({ title, cols, onOpen }: { title: ReactNode; cols: Col[]; onOpen?: () => void }) {
  return (
    <Card title={title} onOpen={onOpen}>
      <div className="kit-cols" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
        {cols.map((c) => (
          <span key={c.key} className="kit-col" role="img" aria-label={kitWords.columnOf(c.label, Math.round(clampPct(c.pct)))}>
            <i style={{ height: `${Math.max(clampPct(c.pct), 4)}%`, background: c.color, color: c.ink }}>{c.pct >= 12 && kitWords.pct(Math.round(c.pct))}</i>
          </span>
        ))}
      </div>
      <div className="kit-colx" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {cols.map((c) => (
          <span key={c.key}>{c.label}</span>
        ))}
      </div>
    </Card>
  )
}
