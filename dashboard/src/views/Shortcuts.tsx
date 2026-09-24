// Every shortcut in one place. It opens with ? from anywhere, from the ⋯ menu
// on a phone, and from the account dialog — the keys are the fastest way to
// use trckable, so they should not be a secret.
import { useEffect, useState } from 'react'
import { Modal } from '../components/Modal'

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Getting around',
    keys: [
      ['?', 'This list'],
      ['⌘K', 'Ask trckable'],
      ['F', 'Core ↔ Full'],
      ['Esc', 'Close what is open'],
    ],
  },
  {
    title: 'The period',
    keys: [
      ['T', 'Today'],
      ['Y', 'Yesterday'],
      ['7', 'Last 7 days'],
      ['3', 'Last 30 days'],
      ['9', 'Last 90 days'],
      ['W', 'This week'],
      ['M', 'This month'],
      ['1', 'Last 12 months'],
      ['← →', 'Step back and forward'],
      ['C', 'Compare on or off'],
    ],
  },
  {
    title: 'Reading the chart',
    keys: [
      ['Click a row', 'Filter the whole dashboard by it'],
      ['Click the chart', 'See a single day'],
      ['Drag the scrubber', 'Replay the period'],
    ],
  },
]

/** Open the list from anywhere: a menu item, a button, another dialog. */
export function openShortcuts() {
  window.dispatchEvent(new CustomEvent('trckable:shortcuts'))
}

export function Shortcuts() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest?.('input, textarea, select, [contenteditable]')) return
      // Some keyboards and layouts report the shifted slash rather than "?".
      if (e.key === '?' || (e.shiftKey && (e.key === '/' || e.code === 'Slash'))) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('trckable:shortcuts', show)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('trckable:shortcuts', show)
      window.removeEventListener('keydown', key)
    }
  }, [])
  if (!open) return null
  return (
    <Modal label="Keyboard shortcuts" className="keys-modal" onClose={() => setOpen(false)}>
      <div className="card-head">
        <h2>Shortcuts</h2>
        <button type="button" className="btn icon ghost" aria-label="Close" onClick={() => setOpen(false)} style={{ marginLeft: 'auto' }}>
          ×
        </button>
      </div>
      <div className="keys-grid">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <span className="bullets-head">{g.title}</span>
            <ul className="keys-list">
              {g.keys.map(([k, what]) => (
                <li key={k}>
                  <span className="kbd">{k}</span>
                  <span className="muted">{what}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <span className="faint" style={{ fontSize: 12 }}>
        Press ? any time to see this again.
      </span>
    </Modal>
  )
}
