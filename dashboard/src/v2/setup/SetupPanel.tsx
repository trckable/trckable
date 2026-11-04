import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { more, type SetupItem, type SetupState, type SiteKind, type Verified } from '../../lib/apiMore'
import { can } from '../../lib/permissions'
import { earned, missing } from '../../features/verified/model'
import { Sources, useVerified } from '../../features/verified/Sources'
import { copy } from './copy'
import { splitOf, withoutShown } from './model'
import { Pop } from './Pop'
import { RingMark } from './RingMark'
import { rowView, type RowCtx } from './rows'
import { SetupRow } from './SetupRow'

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

/** The panel: the open steps as rows, one quiet "More" link for the done ones and the extras, the site type and Hide. */
export function SetupPanel({ state, x, onHide, locked, check, verified }: { state: SetupState; x: RowCtx; onHide: () => void; /** The site's verified sources: when it has any, they are one block of this popup, not a second popup. */ verified?: Verified; /** Everything counted is done: the header's tick and words. */ check: boolean; /** Install is still open: the steps after it show, and wait. */ locked?: boolean }) {
  const [open, setOpen] = useState(false)
  const proven = earned(verified).length > 0
  const data = useVerified(verified, x.site, false, proven)
  // The verified block shows every source it can: the earned ones, and a Connect row for the rest where the person may connect.
  const shown = [...earned(data), ...(can('site.settings') ? missing(data) : [])]
  const head = check ? copy.allSet : copy.title(state.done, state.counted)
  const { todo, done, more: extra } = splitOf(proven ? withoutShown(state.items, shown) : state.items)
  const fold = [...done, ...extra]
  const view = (it: SetupItem) => rowView(it, x, state.goal_suggestion)
  const rows = (items: SetupItem[]) => items.map((it) => <SetupRow key={it.id} row={view(it)} />)
  const waiting = (items: SetupItem[]) => items.map((it) => <SetupRow key={it.id} row={{ ...view(it), acts: [], sub: copy.locked, locked: true }} />)
  return (
    <>
      <div className="shead">
        <RingMark done={state.done} counted={state.counted} check={check} />
        <b>{head}</b>
      </div>
      {todo.length > 0 && <div className="sgrp">{locked ? waiting(todo) : rows(todo)}</div>}
      {proven && (
        <div className="svf">
          <Sources data={data} site={x.site} viewer={false} close={x.close} />
        </div>
      )}
      {fold.length > 0 && (
        <>
          <button type="button" className="sfold" aria-expanded={open} onClick={() => setOpen(!open)}>
            {copy.moreCount(fold.length)}
            <ChevronRight size={14} className={open ? 'open' : ''} aria-hidden="true" />
          </button>
          {open && <div className="sgrp">{rows(fold)}</div>}
        </>
      )}
      <Kind state={state} x={x} />
      <div className="spfoot">
        <button type="button" onClick={onHide}>
          {copy.hide}
        </button>
      </div>
    </>
  )
}
