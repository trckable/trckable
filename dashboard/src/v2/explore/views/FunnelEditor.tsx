// The card to change the funnel: its steps as numbered chips, one "+ Add step" that opens a search over the pages, and
// the note on when counting starts. It sits in the card's body, on the card's own surface.
import { Flag, Plus, X } from 'lucide-react'
import { createElement, useState } from 'react'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { pageIcon } from '../pageIcon'
import type { Funnel } from '../types'

const label = (p: string) => (p === '/' ? copy.homePage : p)

function Chip({ n, name, page, onRemove, removeLabel }: { n?: number; name: string; page?: string; onRemove?: () => void; removeLabel: string }) {
  const ico = page === undefined ? null : createElement(pageIcon(page), { 'aria-hidden': true })
  return (
    <span className="xfst">
      {n !== undefined && <b>{n}</b>}
      {ico}
      <span className="nm">{name}</span>
      {onRemove && (
        <button type="button" aria-label={removeLabel} onClick={onRemove}>
          <X aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

function Picker({ x, pages, onDone }: { x: XCtx; pages: Funnel['pages']; onDone: () => void }) {
  const [q, setQ] = useState('')
  const hits = pages.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))
  const add = (name: string, kind: 'step' | 'goal') => {
    x.addCustom(name, kind)
    onDone()
  }
  return (
    <div className="xfpk">
      <input type="text" autoFocus value={q} placeholder={copy.searchPages} aria-label={copy.searchPages} onChange={(e) => setQ(e.target.value)} />
      <div className="xfpl" role="list">
        {hits.length === 0 && <span className="xnone">{copy.noPageMatch}</span>}
        {hits.map((p) => {
          return (
            <div key={p.name} className="xfpr" role="listitem">
              <button type="button" className="xfpn" onClick={() => add(p.name, 'step')}>
                {createElement(pageIcon(p.name), { 'aria-hidden': true })}
                <span className="nm">{label(p.name)}</span>
              </button>
              <button type="button" className="xfpg" aria-label={copy.addGoalFor(label(p.name))} title={copy.addGoalFor(label(p.name))} onClick={() => add(p.name, 'goal')}>
                <Flag aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function FunnelEditor({ x, d }: { x: XCtx; d: Funnel }) {
  const { steps, goals } = x.custom
  const [picking, setPicking] = useState(false)
  const base = d.spec.map((s) => ({ name: label(s.value), page: s.kind === 'page' ? s.value : undefined }))
  const all = [...base, ...steps.map((n) => ({ name: label(n), page: n }))]
  return (
    <div className="xedc">
      <div className="xfs">
        {all.map((s, i) => (
          <span key={`${i}${s.name}`} className="xfsi">
            {i > 0 && <span className="xfar" aria-hidden="true">{'→'}</span>}
            <Chip n={i + 1} name={s.name} page={s.page} removeLabel={copy.removeStep(s.name)} onRemove={i >= base.length ? () => x.removeCustom('step', i - base.length) : undefined} />
          </span>
        ))}
        {goals.map((n, i) => (
          <Chip key={`g${n}`} name={copy.goalChip(label(n))} page={n} removeLabel={copy.removeGoal(n)} onRemove={() => x.removeCustom('goal', i)} />
        ))}
        <button type="button" className="xb xfadd" id="xAdd" aria-expanded={picking} onClick={() => setPicking(!picking)}>
          <Plus aria-hidden="true" />
          {all.length === 0 ? copy.pickFirst : copy.addStep}
        </button>
      </div>
      {picking && <Picker x={x} pages={d.pages} onDone={() => setPicking(false)} />}
      <div className="xedf">
        <span>{copy.countsFrom}</span>
        <button type="button" className="xb" id="xSaveF" onClick={() => x.setEdit(false)}>
          {copy.done}
        </button>
      </div>
    </div>
  )
}
