// The toasts themselves: a chunk of its own, which Toast.tsx loads when the
// first one is told or the browser is idle. Small messages, bottom right.
// Every action that changes something says so (a silent success looks exactly
// like a bug) and everything that went wrong is said here too, in a few plain
// words (lib/errors.ts), never as red text under a form. Four kinds, each with
// its own mark: success, info, warning and error; and busy, a spinner that a
// result later replaces. A toast may carry one button, can be closed, and
// clears itself (an error stays longest; pointing at it or tabbing into it
// holds it). At most three show at once. Errors and warnings are announced at
// once (role=alert), the rest politely (role=status).
import { Check, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { friendly } from '../lib/errors'
import { errorCopy } from '../lib/errorCopy'
import { EVENT, hostIsUp, nextId, type Kind, type Told, type ToastAction } from './toastBus'
import { toastCopy as t } from './toastCopy'
import './Toast.css'

type Item = { id: number; text: string; kind: Kind; action?: ToastAction }

const MAX = 3
/** How long each kind stays, in ms (busy stays until it is replaced). */
const HOLD: Record<Exclude<Kind, 'busy'>, number> = { success: 3500, info: 5000, warning: 7000, error: 9000 }

/** A failure, put into friendly words (nothing for a request cancelled on purpose). */
function said(d: Told): Told | null {
  const f = friendly(d.error)
  if (!f) return null
  const action = f.action ?? (d.retry ? { label: errorCopy.retry, run: d.retry } : undefined)
  return { ...d, text: f.text, kind: f.kind, action }
}

/** The mark before a toast's text: a spinner while busy, else one for its kind. */
function Mark({ kind }: { kind: Kind }) {
  if (kind === 'busy')
    return <span className="stage-mark" aria-hidden="true" style={{ animation: 'spin 0.8s linear infinite', borderColor: 'var(--accent)', borderRightColor: 'transparent' }} />
  if (kind === 'success') return <Check size={17} strokeWidth={2} aria-hidden="true" />
  if (kind === 'info') return <Info size={17} strokeWidth={1.75} aria-hidden="true" />
  if (kind === 'warning') return <TriangleAlert size={17} strokeWidth={1.75} aria-hidden="true" />
  return <CircleAlert size={17} strokeWidth={1.75} aria-hidden="true" />
}

function Card({ item, onDone }: { item: Item; onDone: (id: number) => void }) {
  const [held, setHeld] = useState(false)
  const { id, kind } = item
  // A result clears itself, unless it is being read; a busy one waits for its outcome.
  useEffect(() => {
    if (kind === 'busy' || held) return
    const timer = setTimeout(() => onDone(id), HOLD[kind])
    return () => clearTimeout(timer)
  }, [id, kind, held, onDone])
  const { action } = item
  return (
    <div className={'toast ' + kind} onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      <Mark kind={kind} />
      <span className="toast-text">{item.text}</span>
      {action && (
        <button
          type="button"
          className="toast-act"
          onClick={() => {
            onDone(id)
            action.run()
          }}
        >
          {action.label}
        </button>
      )}
      {kind !== 'busy' && (
        <button type="button" className="toast-x" aria-label={t.dismiss} onClick={() => onDone(id)}>
          <X size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export default function ToastHost() {
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => {
    const on = (e: Event) => {
      const told = (e as CustomEvent).detail as Told
      const d = 'error' in told ? said(told) : told
      if (!d) return
      setItems((list) => {
        // The same message twice (a button pressed again) is one toast, shown
        // afresh — never a stack of copies.
        const rest = (d.replace ? list.filter((x) => x.id !== d.id) : list).filter((x) => !(x.text === d.text && x.kind === d.kind))
        return d.text ? [...rest, { id: d.replace ? nextId() : d.id, text: d.text, kind: d.kind, action: d.action }].slice(-MAX) : rest
      })
    }
    window.addEventListener(EVENT, on)
    hostIsUp()
    return () => window.removeEventListener(EVENT, on)
  }, [])
  const drop = useCallback((id: number) => setItems((list) => list.filter((x) => x.id !== id)), [])
  // Two regions that are always there, so a screen reader hears a toast the
  // moment it arrives: trouble at once, everything else when it is free.
  const loud = items.filter((x) => x.kind === 'error' || x.kind === 'warning')
  const calm = items.filter((x) => x.kind !== 'error' && x.kind !== 'warning')
  return (
    <div className="toasts">
      <div className="toast-group" role="status">
        {calm.map((x) => <Card key={x.id} item={x} onDone={drop} />)}
      </div>
      <div className="toast-group" role="alert">
        {loud.map((x) => <Card key={x.id} item={x} onDone={drop} />)}
      </div>
    </div>
  )
}
