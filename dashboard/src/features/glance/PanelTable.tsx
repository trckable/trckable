// The detail panel's table: every row of the tile's dimension, sorted by a
// click on a header (real buttons). A row sets a filter on the whole page.
import { useMemo, useState } from 'react'
import { fmtInt, fmtPct } from '../../lib/format'
import { copy } from './copy'
import type { TableRow } from './model'

type Col = 'label' | 'visitors' | 'leave'
/** Leave at or above this is set in amber, with the word "leave" beside the header too. */
export const HIGH_LEAVE = 0.85

function cmp(a: TableRow, b: TableRow, col: Col): number {
  if (col === 'label') return a.label.localeCompare(b.label)
  if (col === 'leave') return (a.leave ?? -1) - (b.leave ?? -1)
  return a.visitors - b.visitors
}

/** A second click on a header reverses it; a first click starts text ascending, numbers descending. */
function next(b: { col: Col; dir: 1 | -1 }, col: Col): { col: Col; dir: 1 | -1 } {
  if (b.col === col) return { col, dir: b.dir === 1 ? -1 : 1 }
  return { col, dir: col === 'label' ? 1 : -1 }
}

const leaveText = (r: TableRow) => (r.leave === undefined ? copy.none : fmtPct(r.leave))

function sortOf(b: { col: Col; dir: 1 | -1 }, col: Col): 'ascending' | 'descending' | 'none' {
  if (b.col !== col) return 'none'
  return b.dir === 1 ? 'ascending' : 'descending'
}

interface Props {
  rows: TableRow[]
  dimName: string
  onRow: (r: TableRow) => void
}

export function PanelTable({ rows, dimName, onRow }: Props) {
  const [by, setBy] = useState<{ col: Col; dir: 1 | -1 }>({ col: 'visitors', dir: -1 })
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => cmp(a, b, by.col) * by.dir)
  }, [rows, by])
  const head = (col: Col, text: string) => (
    <th aria-sort={sortOf(by, col)}>
      <button type="button" aria-label={copy.sortBy(text)} onClick={() => setBy((b) => next(b, col))}>
        {text}
        {by.col === col && <span aria-hidden="true">{by.dir === 1 ? ' ↑' : ' ↓'}</span>}
      </button>
    </th>
  )
  if (!rows.length) return <p className="g-story">{copy.noData}</p>
  return (
    <div className="g-table-wrap">
      <table>
        <thead>
          <tr>{head('label', dimName)}{head('visitors', copy.colVisitors)}{head('leave', copy.colLeave)}</tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.key}>
              <td title={r.label}>
                <button type="button" className="g-row" onClick={() => onRow(r)}>{r.label}</button>
              </td>
              <td>{fmtInt(r.visitors)}</td>
              <td className={r.leave !== undefined && r.leave >= HIGH_LEAVE ? 'warn' : 'dim'}>{leaveText(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
