// Small confirmations, bottom right. Every action that changes something says
// so — a silent success looks exactly like a bug.
import { Check, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

type Kind = 'ok' | 'error' | 'busy'
type Item = { id: number; text: string; kind: Kind }

let seq = 0

/** Say what just happened. Returns the id, so a busy toast can be replaced. */
export function toast(text: string, kind: Kind = 'ok'): number {
  const id = ++seq
  window.dispatchEvent(new CustomEvent('trckable:toast', { detail: { id, text, kind } }))
  return id
}

/** Replace a busy toast with its outcome (or drop it with text = ''). */
export function settle(id: number, text: string, kind: Kind = 'ok') {
  window.dispatchEvent(new CustomEvent('trckable:toast', { detail: { id, text, kind, replace: true } }))
}

export function Toasts() {
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as Item & { replace?: boolean }
      setItems((list) => {
        const rest = d.replace ? list.filter((t) => t.id !== d.id) : list
        return d.text ? [...rest, { id: d.replace ? ++seq : d.id, text: d.text, kind: d.kind }].slice(-3) : rest
      })
    }
    window.addEventListener('trckable:toast', on)
    return () => window.removeEventListener('trckable:toast', on)
  }, [])

  // Anything that is not still running clears itself.
  useEffect(() => {
    const t = setTimeout(() => setItems((l) => l.filter((x) => x.kind === 'busy' || l.indexOf(x) !== 0)), 3500)
    return () => clearTimeout(t)
  }, [items])

  if (!items.length) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          {t.kind === 'busy' ? (
            <span className="stage-mark" aria-hidden="true" style={{ animation: 'spin 0.8s linear infinite', borderColor: 'var(--accent)', borderRightColor: 'transparent' }} />
          ) : (
            t.kind === 'ok' ? <Check size={17} strokeWidth={2} aria-hidden="true" /> : <TriangleAlert size={17} strokeWidth={1.75} aria-hidden="true" />
          )}
          {t.text}
        </div>
      ))}
    </div>
  )
}
