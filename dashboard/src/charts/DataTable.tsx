// Every chart's table view: the same numbers, readable by a screen reader
// and copyable, with the first column as the row header.
export interface TableData {
  caption: string
  columns: string[]
  rows: (string | number)[][]
}

export function DataTable({ data }: { data: TableData }) {
  return (
    <div className="kit-table">
      <table>
        <caption className="sr">{data.caption}</caption>
        <thead>
          <tr>
            {data.columns.map((c, i) => (
              <th key={c} scope="col" className={i ? 'num' : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {v}
                  </th>
                ) : (
                  <td key={j} className="num">
                    {v}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
