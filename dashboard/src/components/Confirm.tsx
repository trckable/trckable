// Our own confirmation dialog, the only one trckable uses. The browser's
// confirm() is blocked in embedded browsers and some app shells, so a
// destructive action could silently do nothing — and it looks nothing like the
// rest of trckable. Inline "are you sure?" strips are not used either: every
// question that guards something gets this same dialog.
//
//   if (await confirm({ title: 'Delete this view?', danger: true })) …
//   const pw = await confirmWith({ title: 'Turn off two-step sign-in?', field: { label: 'Your password', type: 'password' } })
//
// <ConfirmHost /> is mounted once, at the root; any component may ask.
import { CircleHelp, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DialogActions } from './DialogActions'
import { Modal } from './Modal'

type Ask = {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red button and a warning mark: for what cannot be undone. */
  danger?: boolean
}
type Field = { label: string; type?: 'password' | 'text'; autoComplete?: string }
type Req = Ask & { field?: Field; resolve: (v: string | null) => void }

let show: ((r: Req) => void) | null = null
const ask = (r: Omit<Req, 'resolve'>) =>
  new Promise<string | null>((resolve) => {
    if (!show) return resolve(null) // no host mounted: refuse, never act unasked
    show({ ...r, resolve })
  })

/** Ask a yes/no question; true only if they confirmed. */
export const confirm = (o: Ask) => ask(o).then((v) => v !== null)

/** Ask for one value to go with the answer (a password, say); null if cancelled. */
export const confirmWith = (o: Ask & { field: Field }) => ask(o)

/** The old hook, kept so callers need no host of their own. */
export function useConfirm() {
  return { ask: confirm, dialog: null }
}

export function ConfirmHost() {
  const [queue, setQueue] = useState<Req[]>([])
  useEffect(() => {
    show = (r) => setQueue((q) => [...q, r])
    return () => {
      show = null
    }
  }, [])
  const req = queue[0]
  if (!req) return null
  const done = (v: string | null) => {
    req.resolve(v)
    setQueue((q) => q.slice(1))
  }
  return <ConfirmDialog key={queue.length} req={req} done={done} />
}

function ConfirmDialog({ req, done }: { req: Req; done: (v: string | null) => void }) {
  const [value, setValue] = useState('')
  const Mark = req.danger ? TriangleAlert : CircleHelp
  return (
    <Modal label={req.title} className="confirm-modal" onClose={() => done(null)}>
      <form className="confirm-body" onSubmit={(e) => (e.preventDefault(), (!req.field || value) && done(req.field ? value : ''))}>
        <span className={'modal-badge' + (req.danger ? ' danger' : '')} aria-hidden="true">
          <Mark size={20} strokeWidth={1.75} />
        </span>
        <div className="confirm-text">
          <h2>{req.title}</h2>
          {req.body && <p className="muted">{req.body}</p>}
          {req.field && (
            <label className="field">
              {req.field.label}
              <input
                className="input"
                type={req.field.type ?? 'text'}
                autoComplete={req.field.autoComplete}
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          )}
        </div>
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={() => done(null)} autoFocus={!req.field}>
              {req.cancelLabel ?? 'Cancel'}
            </button>
          }
        >
          <button type="submit" className={req.danger ? 'btn danger big' : 'btn primary big'} disabled={!!req.field && !value}>
            {req.confirmLabel ?? 'Yes'}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
