// Every shortcut in one place. It opens with ? from anywhere, from the ⋯ menu
// on a phone, and from the account dialog — the keys are the fastest way to
// use trckable, so they should not be a secret.
import { useEffect, useState } from 'react'
import { Calendar, ChartSpline, Compass, Keyboard, MousePointer2, MoveHorizontal, RotateCcw, Rows3, X } from 'lucide-react'
import { useConfirm } from '../components/Confirm'
import { Modal } from '../components/Modal'
import { toast } from '../components/Toast'
import { api } from '../lib/api'
import { ACTIONS, caps, comboOf, customKeys, keyFor, loadKeymap, takenBy, useKeymap, type Group } from '../lib/keys'
import './Shortcuts.css'

const ICON = { around: Compass, period: Calendar, mouse: MousePointer2 }

const GROUPS: { id: Group | 'mouse'; title: string; hint: string }[] = [
  { id: 'around', title: 'Getting around', hint: 'Anywhere in trckable' },
  { id: 'period', title: 'The period', hint: 'On a site’s dashboard' },
  { id: 'mouse', title: 'Reading the chart', hint: 'With the mouse or a finger' },
]


// Fixed on purpose: Esc closes what is open everywhere, and the gestures are
// not keys.
const MOUSE = [
  { mouse: 'Click a row', what: 'Filter the whole dashboard by it', icon: Rows3 },
  { mouse: 'Click the chart', what: 'See a single day', icon: ChartSpline },
  { mouse: 'Drag the scrubber', what: 'Replay the period', icon: MoveHorizontal },
]

/** The list itself, loaded the first time someone opens it
    (components/ShortcutsHost.tsx listens for the key). */
export default function Shortcuts({ onClose }: { onClose: () => void }) {
  useKeymap()
  const { ask, dialog } = useConfirm()

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
          <Keyboard size={20} strokeWidth={1.75} />
        </span>
        <div>
          <h2>Keyboard shortcuts</h2>
          <span className="faint">{rec ? 'Press the new key. Esc to cancel.' : 'Try one and its key lights up. Click a key to make it yours.'}</span>
        </div>
        <div className="modal-tools">
          {changed && !rec && (
            <button type="button" className="pill-btn" onClick={async () => {
                await ask({
                  title: count === 1 ? 'Reset the key you changed?' : `Reset all ${count} keys you changed?`,
                  body: 'Every shortcut goes back to how it came. Your own keys are not kept anywhere, so you would have to set them again.',
                  confirmLabel: 'Reset shortcuts',
                  danger: true,
                  busyLabel: 'Resetting…',
                  done: 'Shortcuts are back to the defaults',
                  run: () => api.setKeys({}).then((r) => loadKeymap(r.keys)),
                })
              }} title="Put every key back as it came">
              <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
              Reset
              <span className="count">{count}</span>
            </button>
          )}
          <button type="button" className="modal-close" aria-label="Close" onClick={close}>
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
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
                  {(() => {
                    const I = ICON[g.id]
                    return <I size={16} strokeWidth={1.75} aria-hidden="true" />
                  })()}
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
                          <m.icon size={16} strokeWidth={1.75} aria-hidden="true" />
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
      {dialog}
    </Modal>
  )
}
