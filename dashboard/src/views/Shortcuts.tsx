// Every shortcut in one place. It opens with ? from anywhere, from the ⋯ menu
// on a phone, and from the account dialog — the keys are the fastest way to
// use trckable, so they should not be a secret.
import { useEffect, useState } from 'react'
import { Modal } from '../components/Modal'
import { toast } from '../components/Toast'
import { api } from '../lib/api'
import { ACTIONS, caps, comboOf, customKeys, keyFor, loadKeymap, takenBy, useKeymap, type Group } from '../lib/keys'

const ICON: Record<string, string> = {
  around: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.2 5.8-2.1 6.3-6.3 2.1 2.1-6.3z',
  period: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  mouse: 'M4 3l7 17 2.5-7.5L21 10z',
}

const GROUPS: { id: Group | 'mouse'; title: string; hint: string }[] = [
  { id: 'around', title: 'Getting around', hint: 'Anywhere in trckable' },
  { id: 'period', title: 'The period', hint: 'On a site’s dashboard' },
  { id: 'mouse', title: 'Reading the chart', hint: 'With the mouse or a finger' },
]

function Glyph({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

// Fixed on purpose: Esc closes what is open everywhere, and the gestures are
// not keys.
const MOUSE = [
  { mouse: 'Click a row', what: 'Filter the whole dashboard by it', d: 'M4 6h16M4 12h16M4 18h10' },
  { mouse: 'Click the chart', what: 'See a single day', d: 'M3 17l5-6 4 4 8-9M12 3v18' },
  { mouse: 'Drag the scrubber', what: 'Replay the period', d: 'M3 12h18M8 8l-4 4 4 4M16 8l4 4-4 4' },
]

/** The list itself, loaded the first time someone opens it
    (components/ShortcutsHost.tsx listens for the key). */
export default function Shortcuts({ onClose }: { onClose: () => void }) {
  useKeymap()

  // Try a key while the list is open and its row lights up.
  const [lit, setLit] = useState('')
  // Changing one: the action waiting for its new key, and why the last try
  // was refused.
  const [rec, setRec] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  const changed = Object.keys(customKeys()).length > 0

  const save = (next: Record<string, string>, said: string) =>
    api
      .setKeys(next)
      .then((r) => (loadKeymap(r.keys), toast(said)))
      .catch((e: Error) => toast(e.message, 'error'))

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!rec) return setLit(comboOf(e))
      // Recording: this press is the new key, and nothing else may act on it.
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') return (setRec(null), setWhy(''))
      const combo = comboOf(e)
      if (!combo) return // a modifier on its own: wait for the key
      const other = takenBy(combo, rec)
      if (other) return setWhy(`${caps(combo).join(' ')} already means “${other.label}”.`)
      const action = ACTIONS.find((a) => a.id === rec)!
      const next = customKeys()
      if (combo === action.def) delete next[rec]
      else next[rec] = combo
      setRec(null)
      setWhy('')
      save(next, `${action.label}: ${caps(combo).join(' ')}`)
    }
    const up = () => setLit('')
    // Capture, so a key being recorded never also changes the period behind.
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up)
    }
  }, [rec])

  let n = 0
  const close = onClose
  const count = Object.keys(customKeys()).length
  return (
    <Modal label="Keyboard shortcuts" className="keys-modal" onClose={rec ? undefined : close}>
      <div className="card-head keys-head">
        <span className="modal-badge" aria-hidden="true">
          <Glyph size={18} d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 10h.01M11 10h.01M15 10h.01M7 14h10" />
        </span>
        <div>
          <h2>Keyboard shortcuts</h2>
          <span className="faint">{rec ? 'Press the new key. Esc to cancel.' : 'Try one and its key lights up. Click a key to make it yours.'}</span>
        </div>
        <div className="modal-tools">
          {changed && !rec && (
            <button type="button" className="pill-btn" onClick={() => save({}, 'Shortcuts are back to the defaults')} title="Put every key back as it came">
              <Glyph d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
              Reset
              <span className="count">{count}</span>
            </button>
          )}
          <button type="button" className="modal-close" aria-label="Close" onClick={close}>
            <Glyph d="M6 6l12 12M18 6L6 18" />
          </button>
        </div>
      </div>
      {why && (
        <p className="keys-why" role="alert">
          {why}
        </p>
      )}
      <div className="keys-grid">
        {GROUPS.map((g) => {
          const items = g.id === 'mouse' ? [] : ACTIONS.filter((a) => a.group === g.id)
          return (
            <section key={g.id} className={'keys-group g-' + g.id + (items.length > 6 ? ' wide' : '')}>
              <header>
                <span className="keys-gicon">
                  <Glyph d={ICON[g.id]!} />
                </span>
                <span>
                  <b>{g.title}</b>
                  <span className="faint">{g.hint}</span>
                </span>
              </header>
              <ul className="keys-list">
                {items.map((a) => {
                  const k = keyFor(a.id)
                  const mine = k !== a.def
                  return (
                    <li key={a.id} className={(lit === k ? 'on' : '') + (rec === a.id ? ' rec' : '')} style={{ ['--i' as string]: n++ }}>
                      <button
                        type="button"
                        className="keys-caps"
                        aria-label={`${a.label}: ${caps(k).join(' ')}. Change`}
                        title="Click, then press a new key"
                        onClick={() => (setWhy(''), setRec(rec === a.id ? null : a.id))}
                      >
                        {rec === a.id ? (
                          <kbd className="cap wait">…</kbd>
                        ) : (
                          caps(k).map((c) => (
                            <kbd key={c} className={'cap' + (lit === k ? ' down' : '') + (mine ? ' mine' : '')}>
                              {c}
                            </kbd>
                          ))
                        )}
                      </button>
                      <span className="keys-what">{a.label}</span>
                      {mine && <span className="keys-mine">yours</span>}
                    </li>
                  )
                })}
                {g.id === 'around' && (
                  <li style={{ ['--i' as string]: n++ }} className={lit === 'escape' ? 'on' : undefined}>
                    <span className="keys-caps fixed">
                      <kbd className={'cap' + (lit === 'escape' ? ' down' : '')}>Esc</kbd>
                    </span>
                    <span className="keys-what">Close what is open</span>
                  </li>
                )}
                {g.id === 'mouse' &&
                  MOUSE.map((m) => (
                    <li key={m.mouse} className="keys-mouse" style={{ ['--i' as string]: n++ }}>
                      <span className="keys-caps fixed">
                        <kbd className="cap">
                          <Glyph d={m.d} />
                        </kbd>
                      </span>
                      <span className="keys-what">
                        <b>{m.mouse}</b>
                        {m.what}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )
        })}
      </div>
      <footer className="keys-foot">
        <span className="faint">Changes are kept with your account, so they follow you to any browser.</span>
        <span className="faint">
          Open this with{' '}
          {caps(keyFor('shortcuts')).map((c) => (
            <kbd key={c} className="cap small">
              {c}
            </kbd>
          ))}
        </span>
      </footer>
    </Modal>
  )
}
