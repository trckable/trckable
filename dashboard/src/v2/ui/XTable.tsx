// Explore's tables. One of people (a bar behind the name, how many, against the usual, the share) and one with columns of
// its own. Both end in a button when there are more rows than shown: the rest of the list, or the section that holds it.
import type { ReactNode } from 'react'
import { flag } from '../../lib/format'
import { fmtInt } from '../../lib/format'
import { mult } from '../briefing/model'
import { copy } from '../explore/copy'
import type { Row } from '../explore/types'

export interface More {
  /** The number of rows in all. */
  len: number
  shown: number
  onAll: () => void
  /** A section to go to instead of listing everything here. */
  go?: { label: string; run: () => void; section?: string }
}

function XMore({ more }: { more: More }) {
  if (more.len <= more.shown) return null
  return (
    <button type="button" className="mk-more" data-xall={more.go ? undefined : '1'} data-xsec={more.go?.section} onClick={more.go ? more.go.run : more.onAll}>
      {more.go ? `${more.go.label} ›` : copy.showAll(more.len)}
    </button>
  )
}

function delta(r: Row): { text: string; tone: string } {
  if (r.st === 'up') return { text: `▲ ${r.c > 0.5 && r.v / r.c >= 1.3 ? mult(r.v / r.c) : copy.above}`, tone: 'up' }
  if (r.st === 'dn') return { text: copy.below, tone: 'dn' }
  return { text: copy.usual, tone: '' }
}

export interface XTableProps {
  rows: Row[]
  head: string
  unit?: string
  mono?: boolean
  flags?: boolean
  /** The filter value picked now, and what a tapped row does; without it the rows are plain. */
  selected?: string | null
  onPick?: (r: Row) => void
  /** The filter a row sets: written on the row as the mock did. */
  dim?: string
  limit: number
  onAll: () => void
  go?: { label: string; run: () => void; section?: string }
}

export function XTable({ rows, head, unit = copy.people, mono, flags, selected, onPick, dim, limit, onAll, go }: XTableProps) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.v, r.c)))
  const total = rows.reduce((p, r) => p + r.v, 0) || 1
  return (
    <div className="xt">
      <div className="xth">
        <span>{head}</span>
        <span>{unit}</span>
        <span>{copy.vsUsual}</span>
        <span className="shh">{copy.share}</span>
      </div>
      {rows.slice(0, limit).map((r) => {
        const d = delta(r)
        const inner = (
          <>
            <span className="mk-bar">
              <i style={{ width: `${(r.v / max) * 100}%` }} />
              <span className={mono ? 'mono' : ''}>{flags && r.code ? `${flag(r.code)} ${r.name}` : r.name}</span>
            </span>
            <span className="mk-n">{fmtInt(r.v)}</span>
            <span className={`d ${d.tone}`}>{d.text}</span>
            <span className="sh">{Math.round((r.v / total) * 100)}%</span>
          </>
        )
        if (!onPick) return (
          <div key={r.val} className="xrw">
            {inner}
          </div>
        )
        return (
          <button key={r.val} type="button" data-xd={dim} data-xv={r.val} className={`xrw ${selected != null && selected === r.val ? 'sel' : ''}`} onClick={() => onPick(r)}>
            {inner}
          </button>
        )
      })}
      <XMore more={{ len: rows.length, shown: limit, onAll, go }} />
    </div>
  )
}

export interface Col {
  h: string
  /** Hidden on a phone. */
  hm?: boolean
}

export interface CRow {
  key: string
  a: ReactNode
  /** The share of the widest row, 0 to 1: draws the bar behind the name. */
  bar?: number
  mono?: boolean
  c: ReactNode[]
}

export function XCols({ first, cols, rows, xc, xcm, limit, onAll }: { first: string; cols: Col[]; rows: CRow[]; xc: string; xcm?: string; limit: number; onAll: () => void }) {
  return (
    <div className="xt xc" style={{ '--xc': xc, '--xcm': xcm ?? xc } as React.CSSProperties}>
      <div className="xth">
        <span>{first}</span>
        {cols.map((c) => (
          <span key={c.h} className={c.hm ? 'hm' : ''}>
            {c.h}
          </span>
        ))}
      </div>
      {rows.slice(0, limit).map((r) => (
        <div key={r.key} className="xrw">
          {r.bar !== undefined ? (
            <span className="mk-bar">
              <i style={{ width: `${r.bar * 100}%` }} />
              <span className={r.mono ? 'mono' : ''}>{r.a}</span>
            </span>
          ) : (
            <span className="two">{r.a}</span>
          )}
          {r.c.map((x, i) => (
            <span key={cols[i].h} className={`mk-n ${cols[i].hm ? 'hm' : ''}`}>
              {x}
            </span>
          ))}
        </div>
      ))}
      <XMore more={{ len: rows.length, shown: limit, onAll }} />
    </div>
  )
}
