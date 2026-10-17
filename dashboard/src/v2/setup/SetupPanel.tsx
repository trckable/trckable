import { useState, type ReactNode } from 'react'
import { more, type SetupItem, type SetupState, type SiteKind } from '../../lib/apiMore'
import { fmtPct } from '../../lib/format'
import { copy } from './copy'
import { SHOWN, percent, splitOf } from './model'
import { rowView, type RowCtx } from './rows'
import { SetupRow } from './SetupRow'

const KINDS: SiteKind[] = ['shop', 'saas', 'content', 'other']

function Kind({ state, x }: { state: SetupState; x: RowCtx }) {
  const [picking, setPicking] = useState(false)
  const k = state.kind
  if (k.value === '') return null
  return (
    <div className="skind">
      <span>{k.chosen ? copy.kindLine.chosen : copy.kindLine[k.value]}</span>
      {x.can && (
        <button type="button" className="sgo" aria-expanded={picking} onClick={() => setPicking(!picking)}>
          {copy.change}
        </button>
      )}
      {picking && (
        <span className="skinds" role="group">
          {KINDS.map((v) => (
            <button
              key={v}
              type="button"
              className="snf"
              aria-pressed={k.value === v}
              onClick={() => {
                setPicking(false)
                x.change((s) => more.setupKind(s, v))
              }}
            >
              {copy.kinds[v]}
            </button>
          ))}
        </span>
      )}
    </div>
  )
}

function Fold({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <>
      <button type="button" className="smore" aria-expanded={open} onClick={onToggle}>
        <span>{label}</span>
        <span aria-hidden="true">{open ? '\u25B4' : '\u25BE'}</span>
      </button>
      {open && <div className="sgrp">{children}</div>}
    </>
  )
}

/** The panel: the next few steps open, the rest folded (done, more to do, more you can add), and who sees it. */
export function SetupPanel({ state, x, onHide }: { state: SetupState; x: RowCtx; onHide: () => void }) {
  const [open, setOpen] = useState({ todo: false, done: false, more: false })
  const toggle = (k: keyof typeof open) => setOpen({ ...open, [k]: !open[k] })
  const { todo, done, more: extra } = splitOf(state.items)
  const view = (items: SetupItem[]) => items.map((it) => <SetupRow key={it.id} row={rowView(it, x, state.goal_suggestion)} />)
  const pct = percent(state.done, state.counted)
  const rest = todo.slice(SHOWN)
  return (
    <>
      <Kind state={state} x={x} />
      <div className="shead">
        <b>{copy.title}</b>
        <span>{fmtPct(pct / 100)}</span>
      </div>
      <div className="sbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={copy.title}>
        <i style={{ width: `${pct}%` }} />
      </div>
      {todo.length > 0 && (
        <section className="sgrp" aria-label={copy.next}>
          <h4>{copy.next}</h4>
          {view(todo.slice(0, SHOWN))}
          {rest.length > 0 && (
            <Fold label={copy.moreToDo(rest.length)} open={open.todo} onToggle={() => toggle('todo')}>
              {view(rest)}
            </Fold>
          )}
        </section>
      )}
      {done.length > 0 && (
        <Fold label={copy.doneCount(done.length)} open={open.done} onToggle={() => toggle('done')}>
          {view(done)}
        </Fold>
      )}
      {extra.length > 0 && (
        <Fold label={copy.moreCount(extra.length)} open={open.more} onToggle={() => toggle('more')}>
          {view(extra)}
        </Fold>
      )}
      <div className="spfoot">
        <span>{copy.only}</span>
        <button type="button" className="snf" onClick={onHide}>
          {copy.hide}
        </button>
      </div>
    </>
  )
}
