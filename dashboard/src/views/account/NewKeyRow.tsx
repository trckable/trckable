// Creating a key: a name and Create, inline. The secret then shows once, in a
// highlighted row with Copy, and the row folds away.
import { Check, Copy, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { toast } from '../../components/Toast'
import { api, messageOf } from '../../lib/api'
import { keys as t } from './keysCopy'

export function NewKeyRow({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const create = () => {
    setBusy(true)
    setErr(null)
    api
      .createKey(name.trim() || t.defaultName)
      .then((r) => {
        setSecret(r.secret)
        onCreated()
      })
      .catch((e: unknown) => setErr(messageOf(e)))
      .finally(() => setBusy(false))
  }
  const copy = (s: string) =>
    navigator.clipboard?.writeText(s).then(() => {
      setCopied(true)
      toast(t.copiedToast)
      // Copied: the row folds away, and the secret is not shown again.
      setTimeout(onClose, 1200)
    })

  if (secret)
    return (
      <div className="person key-secret" role="group" aria-label={t.secretLabel}>
        <code>{secret}</code>
        <button type="button" className="btn primary" onClick={() => void copy(secret)}>
          {copied ? <Check size={15} strokeWidth={2} aria-hidden="true" /> : <Copy size={15} strokeWidth={1.75} aria-hidden="true" />}
          {copied ? t.copied : t.copy}
        </button>
        <button type="button" className="btn icon ghost" aria-label={t.close} onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    )
  const leave = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || busy) return
    e.stopPropagation()
    onClose()
  }
  return (
    <form
      className="person add-row"
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) create()
      }}
    >
      <input className="input" aria-label={t.nameLabel} value={name} maxLength={80} autoFocus placeholder={t.namePlaceholder} onKeyDown={leave} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? t.creating : t.create}
      </button>
      <button type="button" className="btn icon ghost" aria-label={t.cancel} disabled={busy} onClick={onClose}>
        <X size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {err && (
        <span className="add-err" role="alert">
          {err}
        </span>
      )}
    </form>
  )
}
