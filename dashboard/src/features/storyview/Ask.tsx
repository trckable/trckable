// What the person came to find out, and whether the story helped. Local for
// now: nothing is sent anywhere, the answers only go to the console.
import { useState } from 'react'
import { copy } from './copy'

export function Ask() {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const [voted, setVoted] = useState<'yes' | 'no' | null>(null)
  const send = () => {
    if (!text.trim()) return
    console.log('story: asked', text.trim())
    setSent(true)
  }
  const vote = (v: 'yes' | 'no') => {
    console.log('story: useful', v)
    setVoted(v)
  }
  return (
    <section className="sv-ask">
      <label htmlFor="sv-ask">{copy.askLabel}</label>
      <input
        id="sv-ask"
        type="text"
        value={text}
        placeholder={copy.askPlaceholder}
        onChange={(e) => {
          setText(e.target.value)
          setSent(false)
        }}
        onKeyDown={(e) => e.key === 'Enter' && send()}
      />
      <button type="button" className="sv-btn" onClick={send}>
        {sent ? copy.askThanks : copy.askSend}
      </button>
      <div className="sv-useful">
        {copy.useful}
        {voted ? (
          <span>{copy.thanks}</span>
        ) : (
          <>
            <button type="button" className="sv-btn small" aria-label={copy.yesLabel} onClick={() => vote('yes')}>
              {copy.yes}
            </button>
            <button type="button" className="sv-btn small" aria-label={copy.noLabel} onClick={() => vote('no')}>
              {copy.no}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
