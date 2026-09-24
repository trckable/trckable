// A value with a Copy button, and a Show button when it is secret.
import { useState } from 'react'

export function Copyable({ value, secret }: { value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret)
  const [copied, setCopied] = useState(false)
  return (
    <div className="copyable">
      <code className="num">{shown ? value : '•'.repeat(Math.min(22, value.length))}</code>
      {secret && !shown && (
        <button type="button" className="btn ghost" onClick={() => setShown(true)}>
          Show
        </button>
      )}
      <button
        type="button"
        className="btn"
        onClick={() =>
          navigator.clipboard?.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          })
        }
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
