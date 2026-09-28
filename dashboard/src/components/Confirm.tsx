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
import { Suspense, useEffect, useState } from 'react'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'

// The dialog is its own chunk, fetched while the browser is idle: every
// question is asked in answer to a click, long after that.
const ConfirmDialog = lazyLoad(() => import('./ConfirmDialog'))

type Ask = {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red button and a warning mark: for what cannot be undone. */
  danger?: boolean
  /** Do the thing from inside the dialog: it stays open with the button
   *  busy until the server says done, then closes with `done` as a toast;
   *  a failure is shown in the dialog, which stays open to try again. */
  run?: (value: string) => Promise<unknown>
  busyLabel?: string
  done?: string
}
type Field = { label: string; type?: 'password' | 'text'; autoComplete?: string }
export type Req = Ask & { field?: Field; resolve: (v: string | null) => void }

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
    whenIdle(ConfirmDialog.preload)
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
  return (
    <Suspense fallback={null}>
      <ConfirmDialog key={queue.length} req={req} done={done} />
    </Suspense>
  )
}
