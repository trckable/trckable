import { copy } from './copy'
import type { RowView } from './rows'

/** One step: a round tick, its words and, at the end, "Done" or the actions that open the place it gets done. */
export function SetupRow({ row }: { row: RowView }) {
  return (
    <div className={`sprow${row.done ? ' done' : ''}`} data-step={row.id}>
      <span className="schk" aria-hidden="true" />
      <span className="stxt">
        <b>{row.title}</b>
        <small>{row.sub}</small>
      </span>
      <span className="sacts">
        {row.done && <span className="sok">{copy.done}</span>}
        {row.acts.map((a) => (
          <button key={a.label} type="button" className={a.quiet ? 'snf' : 'sgo'} onClick={a.run}>
            {a.label}
          </button>
        ))}
      </span>
    </div>
  )
}
