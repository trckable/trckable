import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { more, type SetupItem, type SetupState, type SiteKind, type Verified } from '../../lib/apiMore'
import { copy as vcopy } from '../../features/verified/copy'
import { can } from '../../lib/permissions'
import { earned, lastChecked, missing } from '../../features/verified/model'
import { Sources, useVerified } from '../../features/verified/Sources'
import { whenWords } from '../../features/verified/time'
import { copy } from './copy'
import { splitOf, withoutShown } from './model'
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
        <Pop label={copy.kind} className="schip" items={KINDS.map((v) => ({ label: copy.kinds[v], checked: v === k, run: () => x.change((s) => more.setupKind(s, v)) }))}>
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
export function SetupPanel({ state, x, onHide, locked, check, verified }: { state: SetupState; x: RowCtx; onHide: () => void; /** The site's verified sources: when it has any, they are one block of this popup, not a second popup. */ verified?: Verified; /** Everything counted is done: the header's tick and words. */ check: boolean; /** Install is still open: the steps after it show, and wait. */ locked?: boolean }) {
  const [open, setOpen] = useState({ done: false, more: false })
  const proven = earned(verified).length > 0
  const data = useVerified(verified, x.site, false, proven)
  const names = earned(data).map((k) => vcopy.names[k]).join(', ')
  const when = lastChecked(data)
  // The verified block shows every source it can: the earned ones, and a Connect row for the rest where the person may connect.
  const shown = [...earned(data), ...(can('site.settings') ? missing(data) : [])]
  const allSet = proven ? copy.allSetVerified : copy.allSet
  const head = check ? allSet : copy.title(state.done, state.counted)
  const toggle = (k: keyof typeof open) => setOpen({ ...open, [k]: !open[k] })
  const { todo, done, more: extra } = splitOf(proven ? withoutShown(state.items, shown) : state.items)
  const view = (it: SetupItem) => rowView(it, x, state.goal_suggestion)
  const rows = (items: SetupItem[]) => items.map((it) => <SetupRow key={it.id} row={view(it)} />)
  const waiting = (items: SetupItem[]) => items.map((it) => <SetupRow key={it.id} row={{ ...view(it), acts: [], sub: copy.locked, locked: true }} />)
  return (
    <>
      <div className="shead">
        <RingMark done={state.done} counted={state.counted} check={check} />
        <span className="stxt">
          <b>{head}</b>
          {check && proven && <small>{copy.checks(names)}</small>}
        </span>
      </div>
      {todo.length > 0 && (
        <div className="sgrp">
          <NextCard row={view(todo[0])} />
          {locked ? waiting(todo.slice(1)) : rows(todo.slice(1))}
        </div>
      )}
      {proven && (
        <div className="svf">
          <Sources data={data} site={x.site} viewer={false} close={x.close} />
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
      {proven && when && <div className="spfoot">{vcopy.checked(whenWords(when))}</div>}
      <div className="spfoot">
        <span>{copy.only}</span>
        <button type="button" onClick={onHide}>
          {copy.hide}
        </button>
      </div>
    </>
  )
}
