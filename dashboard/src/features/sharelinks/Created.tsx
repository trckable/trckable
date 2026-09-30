// Right after creating a link, or giving one a new address: the address, with
// what to do with it. It can be copied again later from the list.
import { Check, ExternalLink, QrCode as QrIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { embedSnippet } from '../../views/shareParts'
import { CopyButton } from './CopyButton'
import { copy } from './copy'
import type { Made } from './NewLink'
import { QrCode } from './QrCode'

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
