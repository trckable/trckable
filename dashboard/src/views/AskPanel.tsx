// "Ask trckable" (⌘K): the drawer that says how to connect your own assistant
// to your sites over MCP. This whole file is a lazy chunk (AskLazy).
import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Name } from '../components/Logo'
import { copy } from '../features/ask/copy'
import { Setup } from '../features/ask/Setup'
import './AskPanel.css'
import '../features/ask/Ask.css'

export function AskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <aside className="drawer ask" aria-label={copy.label} aria-hidden={!open} inert={!open}>
      <header className="ask-head">
        <h2>
          {copy.title} <Name />
        </h2>
        <button type="button" className="btn icon ghost" aria-label={copy.close} title={copy.close} onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <Setup onClose={onClose} />
    </aside>
  )
}
