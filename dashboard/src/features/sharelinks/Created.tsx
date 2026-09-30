// Right after creating: the link, which is shown this once (only a hash of it
// is kept), with what to do with it.
import { Check, Copy, ExternalLink, Lock, QrCode as QrIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from '../../components/Toast'
import { embedSnippet } from '../../views/shareParts'
import { copy } from './copy'
import type { Made } from './NewLink'
import { QrCode } from './QrCode'

function CopyButton({ text, label, toastText, primary, first }: { text: string; label: string; toastText: string; primary?: boolean; first?: boolean }) {
  const [done, setDone] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  // The first thing to do here is copy, so focus starts on it, without the scroll autoFocus adds.
  useEffect(() => {
    if (first) btn.current?.focus({ preventScroll: true })
  }, [first])
  const run = () =>
    navigator.clipboard?.writeText(text).then(() => {
      setDone(true)
      toast(toastText)
      setTimeout(() => setDone(false), 1500)
    })
  return (
    <button type="button" ref={btn} className={primary ? 'btn primary' : 'btn'} onClick={run}>
      {done ? <Check size={15} strokeWidth={1.75} aria-hidden="true" /> : <Copy size={15} strokeWidth={1.75} aria-hidden="true" />}
      {done ? copy.copied : label}
    </button>
  )
}

export function Created({ made, domain, onDone }: { made: Made; domain: string; onDone: () => void }) {
  const [qr, setQr] = useState(false)
  const embed = made.sites.length ? embedSnippet(made.url, domain) : null
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panel.current?.scrollIntoView({ block: 'nearest' })
  }, [])
  return (
    <div className="sl-created" role="status" ref={panel}>
      <div className="sl-created-head">
        <span className="sl-check" aria-hidden="true">
          <Check size={14} strokeWidth={2.25} />
        </span>
        <b>{made.name}</b>
        <span className="tag quiet sl-once" title={copy.onceTip}>
          <Lock size={11} strokeWidth={1.75} aria-hidden="true" />
          {copy.once}
        </span>
      </div>
      <div className="sl-url-row">
        <input className="input mono sl-url" readOnly value={made.url} aria-label={copy.copy} onFocus={(e) => e.currentTarget.select()} />
        <CopyButton text={made.url} label={copy.copy} toastText={copy.copiedToast} primary first />
        <button type="button" className="btn icon" aria-label={copy.qr} title={copy.qr} aria-pressed={qr} onClick={() => setQr((v) => !v)}>
          <QrIcon size={16} strokeWidth={1.75} />
        </button>
        <a className="btn icon" href={made.url} target="_blank" rel="noreferrer noopener" aria-label={copy.open} title={copy.open}>
          <ExternalLink size={16} strokeWidth={1.75} />
        </a>
      </div>
      {qr && <QrCode text={made.url} />}
      {embed && (
        <div className="sl-embed">
          <span className="faint">{copy.embedCode}</span>
          <code className="sl-code">{embed}</code>
          <CopyButton text={embed} label={copy.embedCode} toastText={copy.embedCopied} />
        </div>
      )}
      <div className="sl-actions">
        <button type="button" className="btn primary" onClick={onDone}>
          {copy.done}
        </button>
      </div>
    </div>
  )
}
