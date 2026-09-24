// Every shortcut in one place. It opens with ? from anywhere, from the ⋯ menu
// on a phone, and from the account dialog — the keys are the fastest way to
// use trckable, so they should not be a secret.
import { useEffect, useState } from 'react'
import { Modal } from '../components/Modal'

// A shortcut is one or more keys, pressed together (⌘K) or one after another
// (← →); a mouse action has no keys and is shown as the gesture itself.
type Item = { keys?: string[]; mouse?: string; what: string }

const GROUPS: { title: string; hint: string; items: Item[] }[] = [
  {
    title: 'Getting around',
    hint: 'Anywhere in trckable',
    items: [
      { keys: ['?'], what: 'This list' },
      { keys: ['⌘', 'K'], what: 'Ask trckable' },
      { keys: ['F'], what: 'Core ↔ Full' },
      { keys: ['Esc'], what: 'Close what is open' },
    ],
  },
  {
    title: 'The period',
    hint: 'On a site’s dashboard',
    items: [
      { keys: ['T'], what: 'Today' },
      { keys: ['Y'], what: 'Yesterday' },
      { keys: ['7'], what: 'Last 7 days' },
      { keys: ['3'], what: 'Last 30 days' },
      { keys: ['9'], what: 'Last 90 days' },
      { keys: ['W'], what: 'This week' },
      { keys: ['M'], what: 'This month' },
      { keys: ['1'], what: 'Last 12 months' },
      { keys: ['←', '→'], what: 'Step back and forward' },
      { keys: ['C'], what: 'Compare on or off' },
    ],
  },
  {
    title: 'Reading the chart',
    hint: 'With the mouse or a finger',
    items: [
      { mouse: 'Click a row', what: 'Filter the whole dashboard by it' },
      { mouse: 'Click the chart', what: 'See a single day' },
      { mouse: 'Drag the scrubber', what: 'Replay the period' },
    ],
  },
]

/** The keycap a key press lights up. */
function cap(e: KeyboardEvent): string[] {
  if (e.key === 'Escape') return ['Esc']
  if (e.key === 'ArrowLeft') return ['←']
  if (e.key === 'ArrowRight') return ['→']
  if (e.key === 'Meta' || e.key === 'Control') return ['⌘']
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') return ['⌘', 'K']
  if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) return ['?']
  return e.key.length === 1 ? [e.key.toUpperCase()] : []
}

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
  // Try a key while the list is open and its cap lights up.
  const [lit, setLit] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    const down = (e: KeyboardEvent) => setLit(cap(e))
    const up = () => setLit([])
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [open])
  if (!open) return null
  let n = 0
  return (
    <Modal label="Keyboard shortcuts" className="keys-modal" onClose={() => setOpen(false)}>
      <div className="card-head">
        <div>
          <h2>Shortcuts</h2>
          <span className="faint">Try one: its key lights up.</span>
        </div>
        <button type="button" className="btn icon ghost" aria-label="Close" onClick={() => setOpen(false)} style={{ marginLeft: 'auto' }}>
          ×
        </button>
      </div>
      <div className="keys-grid">
        {GROUPS.map((g) => (
          <section key={g.title} className={'keys-group' + (g.items.length > 6 ? ' wide' : '')}>
            <header>
              <b>{g.title}</b>
              <span className="faint">{g.hint}</span>
            </header>
            <ul className="keys-list">
              {g.items.map((it) => {
                const on = !!it.keys && lit.length > 0 && lit.every((k) => it.keys!.includes(k))
                return (
                  <li key={it.what} className={on ? 'on' : undefined} style={{ ['--i' as string]: n++ }}>
                    <span className="keys-caps">
                      {it.keys ? (
                        it.keys.map((k) => (
                          <kbd key={k} className={'cap' + (lit.includes(k) ? ' down' : '')}>
                            {k}
                          </kbd>
                        ))
                      ) : (
                        <span className="gesture">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 3l7 17 2.5-7.5L21 10z" />
                          </svg>
                          {it.mouse}
                        </span>
                      )}
                    </span>
                    <span className="keys-what">{it.what}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
