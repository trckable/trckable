// The footer's Feedback: one box and Send. The note goes to this instance's owners.
import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Modal } from '../kit/Modal'
import { DialogActions } from './DialogActions'
import { DialogHead } from './DialogHead'
import { toast } from './Toast'
import { fail, more } from '../lib/apiMore'
import { footerMoreCopy } from './footerMoreCopy'

const t = footerMoreCopy.dialog

const MAX = 2000

export default function FeedbackDialog({ site, onClose }: { site?: string; onClose: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = () => {
    const message = text.trim()
    if (!message || busy) return
    setBusy(true)
    more
      .sendFeedback(message, site, location.pathname)
      .then(() => {
        toast(t.thanks)
        onClose()
      })
      .catch((e: unknown) => {
        fail(e)
        setBusy(false)
      })
  }
  return (
    <Modal label={footerMoreCopy.feedback} onClose={onClose} keepSize={false}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <DialogHead icon={MessageSquare} heading={footerMoreCopy.feedback} hint={t.hint} />
        <textarea
          className="input feedback-text"
          rows={5}
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          aria-label={t.field}
          autoFocus
        />
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={onClose}>
              {t.cancel}
            </button>
          }
        >
          <button type="submit" className="btn primary big" disabled={busy || !text.trim()}>
            {busy ? t.sending : t.send}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
