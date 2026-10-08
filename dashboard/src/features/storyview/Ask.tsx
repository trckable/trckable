// Whether the story helped, and what the person came to find out: a small card
// that comes up once, after the person has really been reading (a while on the
// page, in a visible tab), and is put away for good once answered or closed.
// Local for now: nothing is sent anywhere, the card only thanks the person.
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { copy } from './copy'

const KEY = 'trckable.ask.done'
/** How long the page is read, with the tab in view, before the card comes. */
const ENGAGED_MS = 45_000

const gone = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
const putAway = () => {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Private mode: it comes back next visit, nothing worse.
  }
}

/** True once the page has been read in view for ENGAGED_MS (counted only while the tab is visible). */
function useEngaged(skip: boolean) {
  const [engaged, setEngaged] = useState(false)
  useEffect(() => {
    if (skip) return
    let seen = 0
    let from = document.visibilityState === 'visible' ? Date.now() : 0
    const tick = window.setInterval(() => {
      const now = Date.now()
      if (from) {
        seen += now - from
        from = now
      }
      if (seen >= ENGAGED_MS) setEngaged(true)
    }, 1000)
    const vis = () => {
      from = document.visibilityState === 'visible' ? Date.now() : 0
    }
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [skip])
  return engaged
}

export function Ask() {
  const [away, setAway] = useState(gone)
  const [text, setText] = useState('')
  const [asking, setAsking] = useState(false)
  const [done, setDone] = useState(false)
  const engaged = useEngaged(away)
  const timer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const close = () => {
    putAway()
    setAway(true)
  }
  const thank = () => {
    putAway()
    setDone(true)
    setAsking(false)
    // The thanks stays a moment, then the card goes.
    timer.current = window.setTimeout(() => setAway(true), 2500)
  }
  const send = () => {
    if (text.trim()) thank()
  }
  if (away || (!engaged && !done)) return null
  return (
    <aside className="sv-ask" aria-label={copy.useful}>
      <button type="button" className="sv-ask-x" aria-label={copy.askClose} onClick={close}>
        <X size={14} aria-hidden="true" />
      </button>
      {done ? <p className="sv-ask-q">{copy.thanks}</p> : <Question asking={asking} text={text} setText={setText} send={send} thank={thank} ask={() => setAsking(true)} stop={() => setAsking(false)} />}
    </aside>
  )
}

function Question({ asking, text, setText, send, thank, ask, stop }: { asking: boolean; text: string; setText: (t: string) => void; send: () => void; thank: () => void; ask: () => void; stop: () => void }) {
  if (asking) {
    return (
      <>
        <label htmlFor="sv-ask" className="sv-ask-q">
          {copy.askLabel}
        </label>
        <input
          id="sv-ask"
          type="text"
          autoFocus
          value={text}
          placeholder={copy.askPlaceholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send()
            if (e.key === 'Escape') stop()
          }}
        />
        <div className="sv-ask-act">
          <button type="button" className="btn primary" onClick={send}>
            {copy.askSend}
          </button>
        </div>
      </>
    )
  }
  return (
    <>
      <p className="sv-ask-q">{copy.useful}</p>
      <div className="sv-ask-act">
        <button type="button" className="btn" aria-label={copy.yesLabel} onClick={thank}>
          {copy.yes}
        </button>
        <button type="button" className="btn" aria-label={copy.noLabel} onClick={thank}>
          {copy.no}
        </button>
        <button type="button" className="btn" onClick={ask}>
          {copy.tellUs}
        </button>
      </div>
    </>
  )
}
