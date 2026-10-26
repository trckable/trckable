// The footer's Feedback: one box and Send. The note goes to this instance's owners.
import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Modal } from '../kit/Modal'
import { ModalMark } from '../kit/ModalMark'
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
    <Modal
      label={footerMoreCopy.feedback}
      onClose={onClose}
      keepSize={false}
      frame={{
        title: footerMoreCopy.feedback,
        subtitle: t.hint,
        icon: <ModalMark icon={MessageSquare} />,
        busy,
        cancel: t.cancel,
        onSubmit: send,
        actions: (
          <button type="submit" className="btn primary big" disabled={busy || !text.trim()}>
            {busy ? t.sending : t.send}
          </button>
        ),
      }}
    >
      <textarea className="input feedback-text" rows={5} value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)} aria-label={t.field} autoFocus />
    </Modal>
  )
}
