import { Check, Lock, MoreHorizontal } from 'lucide-react'
import { copy } from './copy'
import { Pop } from './Pop'
import type { RowAct, RowView } from './rows'

const menuOf = (acts: RowAct[]) => acts.map((a) => ({ label: a.label, run: a.run }))

/** One step: its name and its state on the right (a tick when done, a small button when open); the detail waits in the tooltip. A viewer sees the state only. */
export function SetupRow({ row }: { row: RowView }) {
  const [main, ...rest] = row.acts
  const tip = row.sub || undefined
  if (!main) {
    return (
      <div className={`sprow${row.done ? ' done' : ''}${row.locked ? ' locked' : ''}`} data-step={row.id} title={tip}>
        <b className="stitle">{row.title}</b>
        {row.done && <Check size={14} className="stick" aria-hidden="true" />}
        {row.locked && <Lock size={13} className="stick" aria-hidden="true" />}
      </div>
    )
  }
  return (
    <div className="sprow click" data-step={row.id} title={tip}>
      <button type="button" className="sgo" onClick={main.run}>
        <b className="stitle">{row.title}</b>
        <span className="sword">{main.label}</span>
      </button>
      {rest.length > 0 && (
        <Pop label={copy.moreActions} className="sdots" items={menuOf(rest)}>
          <MoreHorizontal size={16} aria-hidden="true" />
        </Pop>
      )}
    </div>
  )
}
