// Whether the story helped, and what the person came to find out: one quiet
// line under the answers. Local for now: nothing is sent anywhere, the line
// only thanks the person.
import { useState } from 'react'
import { copy } from './copy'

export function Ask() {
  const [text, setText] = useState('')
  const [asking, setAsking] = useState(false)
  const [done, setDone] = useState(false)
  const send = () => {
    if (!text.trim()) return
    setDone(true)
    setAsking(false)
  }
  const close = () => {
    if (!text.trim()) setAsking(false)
  }
  if (done) return <p className="sv-ask">{copy.thanks}</p>
  if (asking) {
    return (
      <div className="sv-ask">
        <label htmlFor="sv-ask" className="sv-visually-hidden">
          {copy.askLabel}
        </label>
        <input
          id="sv-ask"
          type="text"
          autoFocus
          value={text}
          placeholder={copy.askPlaceholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => {
            if (!e.relatedTarget) close()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send()
            if (e.key === 'Escape') close()
          }}
        />
        <button type="button" className="sv-ask-btn" onClick={send}>
          {copy.askSend}
        </button>
      </div>
    )
  }
  return (
    <p className="sv-ask">
      {copy.useful}
      <button type="button" className="sv-ask-btn" aria-label={copy.yesLabel} onClick={() => setDone(true)}>
        {copy.yes}
      </button>
      <span aria-hidden="true">·</span>
      <button type="button" className="sv-ask-btn" aria-label={copy.noLabel} onClick={() => setDone(true)}>
        {copy.no}
      </button>
      <span aria-hidden="true">·</span>
      <button type="button" className="sv-ask-btn" onClick={() => setAsking(true)}>
        {copy.tellUs}
      </button>
    </p>
  )
}
