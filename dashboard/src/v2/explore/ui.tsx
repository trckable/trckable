// The small parts of Explore's tables and cards, in the walkthrough's own markup: a heading line, a note, an empty
// state, the segmented switch inside a section, a number card, the table with a bar behind each name, the table with
// columns of its own, and the placeholder while a table is read.
import type { CSSProperties, ReactNode } from 'react'
import { fmtInt } from '../../lib/format'
import { Ico } from '../ui/icons'
import { barWidths, deltaOf, shareOf, type Row } from './model'

export const XSec = ({ l, r }: { l: ReactNode; r?: ReactNode }) => (
  <div className="xsec">
    <span>{l}</span>
    <span>{r}</span>
  </div>
)

export const XNote = ({ children }: { children: ReactNode }) => <div className="xnote">{children}</div>

export function XEmpty({ title, sub, action }: { title: string; sub: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="xempty">
      <b>{title}</b>
      <span>{sub}</span>
      {action && (
        <button type="button" className="xb" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  )
}

export interface SubItem<T extends string> {
  id: T
  name: string
  /** A small dot after the name: this one is not connected. */
  off?: boolean
}

export function XSub<T extends string>({ items, cur, label, onPick }: { items: SubItem<T>[]; cur: T | ''; label: string; onPick: (id: T) => void }) {
  return (
    <div className="xsub" role="tablist" aria-label={label} style={{ '--n': items.length } as CSSProperties}>
      {items.map((i) => (
        <button key={i.id} type="button" role="tab" aria-selected={i.id === cur} className={i.id === cur ? 'on' : ''} onClick={() => onPick(i.id)}>
          {i.name}
          {i.off && <i className="xdot" title="Not connected" />}
        </button>
      ))}
    </div>
  )
}

/** A card with a number: what it counts, the note on the right, the big figure and a line under it. */
export function XKc({ icon, label, value, unit, note, tone, line }: { icon: 'people' | 'goal' | 'uptime' | 'click' | 'speed'; label: string; value: string; unit?: string; note: string; tone: 'dn' | 'up' | ''; line: string }) {
  return (
    <div className={`kc ns${tone === 'dn' ? ' dn' : ''}`}>
      <div className="kt">
        <span className="ki">
          <Ico name={icon} style={{ color: tone === 'dn' ? '#ff6b6b' : '#c6ff3a' }} />
        </span>
        <span className="kl">{label}</span>
        <span className={`kn ${tone}`}>{note}</span>
      </div>
      <div className="kv">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="kd">{line}</div>
    </div>
  )
}

export interface TableWords {
  people: string
  vsUsual: string
  vsPrevious: string
  share: string
  showAll: (n: number) => string
}

/** The table with a bar behind each name: how many, against its usual (or the period before) and its share. */
export function XTable({ rows, head, unit, comparing, picked, mono, flag, limit, go, onAll, onPick, words, empty }: {
  rows: Row[]
  head: string
  unit?: string
  comparing: boolean
  picked?: string | null
  mono?: boolean
  flag?: (value: string) => string
  limit: number
  go?: { label: string; run: () => void }
  onAll?: () => void
  onPick?: (value: string) => void
  words: TableWords
  empty: ReactNode
}) {
  if (!rows.length) return <>{empty}</>
  const total = rows.reduce((a, r) => a + r.v, 0)
  const widths = barWidths(rows)
  return (
    <div className="xt">
      <div className="xth">
        <span>{head}</span>
        <span>{unit ?? words.people}</span>
        <span>{comparing ? words.vsPrevious : words.vsUsual}</span>
        <span className="shh">{words.share}</span>
      </div>
      {rows.slice(0, limit).map((r, i) => {
        const d = deltaOf(r, comparing)
        const inner = (
          <>
            <span className="mk-bar">
              <i style={{ width: `${widths[i]}%` }} />
              <span className={mono ? 'mono' : ''}>{flag ? `${flag(r.value)} ${r.name}` : r.name}</span>
            </span>
            <span className="mk-n">{fmtInt(r.v)}</span>
            <span className={`d ${d.tone}`}>{d.text}</span>
            <span className="sh">{shareOf(r.v, total)}%</span>
          </>
        )
        return onPick ? (
          <button key={r.value} type="button" className={`xrw${picked === r.value ? ' sel' : ''}`} onClick={() => onPick(r.value)}>
            {inner}
          </button>
        ) : (
          <div key={r.value} className="xrw">
            {inner}
          </div>
        )
      })}
      {rows.length > limit && (
        <button type="button" className="mk-more" onClick={go ? go.run : onAll}>
          {go ? `${go.label} ›` : words.showAll(rows.length)}
        </button>
      )}
    </div>
  )
}

export interface Col {
  h: string
  /** Hidden on a phone. */
  m?: boolean
}
export interface ColRow {
  key: string
  a: ReactNode
  /** The bar behind the first cell, 0 to 1; none for a name that is not a bar. */
  bar?: number
  mono?: boolean
  c: ReactNode[]
}

/** The table with columns of its own: a first cell, and the figures after it. */
export function XCols({ first, cols, rows, xc, xcm, limit, showAll, onAll }: { first: string; cols: Col[]; rows: ColRow[]; xc: string; xcm?: string; limit: number; showAll: (n: number) => string; onAll: () => void }) {
  return (
    <div className="xt xc" style={{ '--xc': xc, '--xcm': xcm ?? xc } as CSSProperties}>
      <div className="xth">
        <span>{first}</span>
        {cols.map((c) => (
          <span key={c.h} className={c.m ? 'hm' : ''}>
            {c.h}
          </span>
        ))}
      </div>
      {rows.slice(0, limit).map((r) => (
        <div className="xrw" key={r.key}>
          {r.bar !== undefined ? (
            <span className="mk-bar">
              <i style={{ width: `${r.bar * 100}%` }} />
              <span className={r.mono ? 'mono' : ''}>{r.a}</span>
            </span>
          ) : (
            <span className="two">{r.a}</span>
          )}
          {r.c.map((c, i) => (
            <span key={cols[i].h} className={`mk-n${cols[i].m ? ' hm' : ''}`}>
              {c}
            </span>
          ))}
        </div>
      ))}
      {rows.length > limit && (
        <button type="button" className="mk-more" onClick={onAll}>
          {showAll(rows.length)}
        </button>
      )}
    </div>
  )
}

export function XSkeleton({ cards, label }: { cards?: number; label: string }) {
  return (
    <div className="xsk" role="status" aria-label={label}>
      {cards ? (
        <div className={`kcs xk${cards === 3 ? ' k3' : ''}`}>
          {Array.from({ length: cards }, (_, i) => (
            <i key={i} className="sk kcsk" />
          ))}
        </div>
      ) : null}
      <i className="sk sh" />
      {Array.from({ length: 7 }, (_, i) => (
        <i key={i} className="sk rw" />
      ))}
    </div>
  )
}
