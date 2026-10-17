import { useState } from 'react'
import { more, type SetupState, type SiteKind } from '../../lib/apiMore'
import { fmtPct } from '../../lib/format'
import { copy } from './copy'
import { percent, rowsOf } from './model'
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

/** The panel: what the ring counts, the steps grouped, what can wait, and who sees it. */
export function SetupPanel({ state, x, onHide }: { state: SetupState; x: RowCtx; onHide: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const rows = rowsOf(state.items)
  const view = (items: typeof rows.core) => items.map((it) => <SetupRow key={it.id} row={rowView(it, x, state.goal_suggestion)} />)
  const pct = percent(state.done, state.counted)
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
      <section className="sgrp" aria-label={copy.groups.core}>
        <h4>{copy.groups.core}</h4>
        {view(rows.core)}
      </section>
      {rows.optional.length > 0 && (
        <section className="sgrp" aria-label={copy.groups.optional}>
          <h4>{copy.groups.optional}</h4>
          {view(rows.optional)}
        </section>
      )}
      <button type="button" className="smore" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
        <span>{copy.moreCount(rows.more.length)}</span>
        <span aria-hidden="true">{moreOpen ? '▴' : '▾'}</span>
      </button>
      {moreOpen && <div className="sgrp">{view(rows.more)}</div>}
      <div className="spfoot">
        <span>{copy.only}</span>
        <button type="button" className="snf" onClick={onHide}>
          {copy.hide}
        </button>
      </div>
    </>
  )
}
