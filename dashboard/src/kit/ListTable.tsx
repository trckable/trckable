// A card with a small table: a quiet header row, then one line per row, numbers
// right-aligned. Put a StatusTag in a cell for a state.
import type { ReactNode } from 'react'
import { Card } from './Card'

export type Column<R> = { key: string; head: ReactNode; cell: (row: R) => ReactNode; num?: boolean }

export function ListTable<R>({ title, aside, columns, rows, rowKey }: { title: ReactNode; aside?: ReactNode; columns: Column<R>[]; rows: R[]; rowKey: (row: R) => string }) {
  return (
    <Card title={title} aside={aside}>
      <table className="kit-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.num ? 'n' : ''}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'n' : ''}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
