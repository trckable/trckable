// A card with a small table: a quiet header row, then one line per row, numbers
// right-aligned. Put a StatusTag in a cell for a state. With `pick` each row is
// a button on its first cell.
import type { ReactNode } from 'react'
import { Card, type CardProps } from './Card'

export type Column<R> = { key: string; head: ReactNode; cell: (row: R) => ReactNode; num?: boolean }

export type RowPick<R> = { onPick: (row: R) => void; label: (row: R) => string; title?: (row: R) => string }

type Props<R> = Pick<CardProps, 'icon' | 'status' | 'title' | 'aside' | 'onOpen' | 'openLabel' | 'stretch' | 'variant' | 'className'> & {
  columns: Column<R>[]
  rows: R[]
  rowKey: (row: R) => string
  /** No header row. */
  bare?: boolean
  pick?: RowPick<R>
}

export function ListTable<R>({ columns, rows, rowKey, bare, pick, ...card }: Props<R>) {
  return (
    <Card {...card}>
      <table className="kit-table">
        {!bare && (
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={c.num ? 'n' : ''}>
                  {c.head}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={pick ? 'pick' : ''}>
              {columns.map((c, i) => (
                <td key={c.key} className={c.num ? 'n' : ''}>
                  {pick && i === 0 ? (
                    <button type="button" className="kit-rowbtn" onClick={() => pick.onPick(r)} aria-label={pick.label(r)} title={pick.title?.(r)}>
                      {c.cell(r)}
                    </button>
                  ) : (
                    c.cell(r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
