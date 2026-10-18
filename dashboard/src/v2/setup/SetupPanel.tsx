import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { more, type SetupItem, type SetupState, type SiteKind } from '../../lib/apiMore'
import { copy } from './copy'
import { splitOf } from './model'
import { Pop } from './Pop'
import { RingMark } from './RingMark'
import { rowView, type RowCtx } from './rows'
import { NextCard, SetupRow } from './SetupRow'

const KINDS: SiteKind[] = ['shop', 'saas', 'content', 'other']

/** The site's kind as one small chip that opens the four choices; a viewer sees it as plain words. */
function Kind({ state, x }: { state: SetupState; x: RowCtx }) {
  const k = state.kind.value
  if (k === '') return null
  return (
    <div className="skind">
      <span>{copy.kind}</span>
      {x.can ? (
        <Pop label={copy.kind} className="schip" up items={KINDS.map((v) => ({ label: copy.kinds[v], checked: v === k, run: () => x.change((s) => more.setupKind(s, v)) }))}>
          {copy.kinds[k]}
          <ChevronDown size={14} aria-hidden="true" />
        </Pop>
      ) : (
        <b>{copy.kinds[k]}</b>
      )}
    </div>
  )
}

/** A quiet line that folds a list open: "2 done", "More you can add". */
function Fold({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <>
      <button type="button" className="sfold" aria-expanded={open} onClick={onToggle}>
        {label}
        <ChevronRight size={14} className={open ? 'open' : ''} aria-hidden="true" />
      </button>
      {open && <div className="sgrp">{children}</div>}
    </>
  )
}

/** The panel: the next step as a card, the other open steps as rows, the done ones and the extras one line each, and who sees it. */
export function SetupPanel({ state, x, onHide }: { state: SetupState; x: RowCtx; onHide: () => void }) {
  const [open, setOpen] = useState({ done: false, more: false })
  const toggle = (k: keyof typeof open) => setOpen({ ...open, [k]: !open[k] })
  const { todo, done, more: extra } = splitOf(state.items)
  const view = (it: SetupItem) => rowView(it, x, state.goal_suggestion)
  const rows = (items: SetupItem[]) => items.map((it) => <SetupRow key={it.id} row={view(it)} />)
  return (
    <>
      <div className="shead">
        <RingMark done={state.done} counted={state.counted} check={false} />
        <b>{copy.title(state.done, state.counted)}</b>
      </div>
      {todo.length > 0 && (
        <div className="sgrp">
          <NextCard row={view(todo[0])} />
          {rows(todo.slice(1))}
        </div>
      )}
      {done.length > 0 && (
        <Fold label={copy.doneCount(done.length)} open={open.done} onToggle={() => toggle('done')}>
          {rows(done)}
        </Fold>
      )}
      {extra.length > 0 && (
        <Fold label={copy.moreCount(extra.length)} open={open.more} onToggle={() => toggle('more')}>
          {rows(extra)}
        </Fold>
      )}
      <Kind state={state} x={x} />
      <div className="spfoot">
        <span>{copy.only}</span>
        <button type="button" onClick={onHide}>
          {copy.hide}
        </button>
      </div>
    </>
  )
}
