import { Check, ChevronRight, Lock, MoreHorizontal } from 'lucide-react'
import { copy } from './copy'
import { Pop } from './Pop'
import type { RowAct, RowView } from './rows'

const menuOf = (acts: RowAct[]) => acts.map((a) => ({ label: a.label, run: a.run }))

/** The next step: its name, one line and the one filled button; the other choices sit as quiet words, "Not for me" in the menu. */
export function NextCard({ row }: { row: RowView }) {
  const [main, ...rest] = row.acts
  const side = rest.filter((a) => !a.skip)
  const skip = rest.filter((a) => a.skip)
  return (
    <div className="snext" data-step={row.id}>
      <span className="stxt">
        <b>{row.title}</b>
        <small>{row.sub}</small>
      </span>
      <span className="sacts">
        {main && (
          <button type="button" className="sbtn" onClick={main.run}>
            {main.label}
          </button>
        )}
        {side.map((a) => (
          <button key={a.label} type="button" className="snf" onClick={a.run}>
            {a.label}
          </button>
        ))}
        {skip.length > 0 && (
          <Pop label={copy.moreActions} className="sdots" items={menuOf(skip)}>
            <MoreHorizontal size={16} aria-hidden="true" />
          </Pop>
        )}
      </span>
    </div>
  )
}

/** A step still open: the whole row does its main thing; the other choices wait in the menu. A viewer sees the words only. */
export function SetupRow({ row }: { row: RowView }) {
  const [main, ...rest] = row.acts
  const words = (
    <>
      <span className="stxt">
        <b>{row.title}</b>
        <small>{row.sub}</small>
      </span>
      {main && (main.word ? <span className="sword">{main.label}</span> : <ChevronRight size={16} className="schev" aria-hidden="true" />)}
    </>
  )
  if (!main) {
    return (
      <div className={`sprow${row.done ? ' done' : ''}${row.locked ? ' locked' : ''}`} data-step={row.id}>
        {row.done && <Check size={14} className="stick" aria-hidden="true" />}
        {row.locked && <Lock size={13} className="stick" aria-hidden="true" />}
        {words}
      </div>
    )
  }
  return (
    <div className="sprow click" data-step={row.id}>
      <button type="button" className="sgo" onClick={main.run}>
        {words}
      </button>
      {rest.length > 0 && (
        <Pop label={copy.moreActions} className="sdots" items={menuOf(rest)}>
          <MoreHorizontal size={16} aria-hidden="true" />
        </Pop>
      )}
    </div>
  )
}
