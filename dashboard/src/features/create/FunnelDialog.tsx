// A new funnel in a short dialog: pick the steps, then Full shows it. The
// steps go in the address (fs=…), so the funnel keeps the period and the
// filters around it and survives a reload or a shared link.
import { useState } from 'react'
import { DialogActions } from '../../components/DialogActions'
import { DialogHead } from '../../components/DialogHead'
import { Modal } from '../../kit/Modal'
import { Picker } from '../../components/Picker'
import type { FunnelStep, Row } from '../../lib/api'
import { dialogCopy as copy } from './dialogCopy'
import './Create.css'

const MAX_STEPS = 8

/** A step as picked: its key, and the name to show for it (a goal as it was written). */
type Picked = FunnelStep & { name: string }

export function FunnelDialog({ pages, goals, onClose, onSave }: { pages: Row[]; goals: Row[]; onClose: () => void; onSave: (steps: FunnelStep[]) => void }) {
  const [steps, setSteps] = useState<Picked[]>([])
  const items = [
    ...pages.slice(0, 20).map((p) => ({ id: 'page:' + p.value, label: p.value, group: copy.pages })),
    ...goals.slice(0, 20).map((g) => ({ id: 'goal:' + g.value, label: g.label || g.value, group: copy.goals })),
  ]
  const add = (id: string) => {
    const i = id.indexOf(':')
    const kind = id.slice(0, i) === 'goal' ? 'goal' : 'page'
    const value = id.slice(i + 1)
    const name = kind === 'goal' ? (goals.find((g) => g.value === value)?.label ?? value) : value
    setSteps([...steps, { kind, value, name }])
  }
  return (
    <Modal label={copy.title} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (steps.length >= 2) onSave(steps.map(({ kind, value }) => ({ kind, value })))
        }}
      >
        <DialogHead heading={copy.title} hint={copy.hint} help={copy.help} />
        <ol className="funnel-steps create-steps" aria-label={copy.steps}>
          {steps.map((s, i) => (
            <li key={i} className="chip">
              <span className="faint">{i + 1}</span>
              {s.name}
              <button type="button" aria-label={copy.remove(s.name)} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
          {steps.length < MAX_STEPS && (
            <li>
              <Picker label={copy.add} placeholder={copy.search} onPick={add} items={items} trigger={() => <span>{copy.addLabel}</span>} />
            </li>
          )}
        </ol>
        {steps.length < 2 && <p className="faint create-intro">{copy.fewer}</p>}
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={onClose}>
              {copy.cancel}
            </button>
          }
        >
          <button type="submit" className="btn primary big" disabled={steps.length < 2}>
            {copy.save}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
