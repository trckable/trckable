// The share sheet: the card as the server draws it (1200 × 630), a link to
// a tiny public page with the card as its preview, and the picture itself.
// Money shows its amount only once "Show amount" is on; it starts off.
import { Download, Image as ImageIcon, Link2, Link2Off, Mail, Moon, Sun, X } from 'lucide-react'
import { useState } from 'react'
import { messageOf, type Milestone, type Site } from '../../lib/api'
import { shareApi } from './share'
import { isViewer } from '../../lib/me'
import { Modal } from '../../components/Modal'
import { Switch } from '../../components/Switch'
import { toast } from '../../components/Toast'
import { copy } from './copy'
import { say } from './words'

async function copyImage(url: string) {
  const blob = await fetch(url, { credentials: 'same-origin' }).then((r) => r.blob())
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export function ShareSheet({ site, m, onClose, onChanged }: { site: Site; m: Milestone; onClose: () => void; onChanged: () => void }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [amount, setAmount] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [shared, setShared] = useState(m.shared)
  const money = m.kind === 'revenue'
  const card = (format: 'png' | 'svg') => shareApi.cardURL(site.id, m, { format, theme, amount: money && amount })
  const w = say(m)
  const line = `${w.big} ${w.label}`.trim()
  const makeLink = () =>
    shareApi
      .share(site.id, m, money && amount)
      .then((r) => {
        setLink(r.url)
        setShared(true)
        onChanged()
        return navigator.clipboard?.writeText(r.url).then(() => toast(copy.copied))
      })
      .catch((e: unknown) => toast(messageOf(e), 'error'))
  const revoke = () =>
    shareApi
      .revoke(site.id, m)
      .then(() => {
        setLink(null)
        setShared(false)
        onChanged()
        toast(copy.revoked)
      })
      .catch((e: unknown) => toast(messageOf(e), 'error'))
  const ThemeIcon = theme === 'dark' ? Sun : Moon
  return (
    <Modal label={copy.sheet} className="ms-modal ms-sheet" onClose={onClose}>
      <div className="ms-head">
        <h2>{copy.sheet}</h2>
        <button type="button" className="btn icon ghost" aria-label={copy.close} onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <img className="ms-card" src={card('svg')} width={1200} height={630} alt={copy.card} />
      <div className="ms-side">
        {!isViewer() && !shared && (
          <button type="button" className="btn primary" onClick={makeLink}>
            <Link2 size={15} strokeWidth={1.75} aria-hidden="true" />
            {copy.copyLink}
          </button>
        )}
        {link && (
          <>
            <code className="ms-link">{link}</code>
            <span className="faint">{copy.linkOnce}</span>
          </>
        )}
        {!isViewer() && shared && (
          <button type="button" className="btn ghost" onClick={revoke}>
            <Link2Off size={15} strokeWidth={1.75} aria-hidden="true" />
            {link ? copy.revoke : `${copy.shared} · ${copy.revoke}`}
          </button>
        )}
        <a className="btn" href={card('png')} download={`${site.domain}-${m.kind}-${m.step}.png`}>
          <Download size={15} strokeWidth={1.75} aria-hidden="true" />
          {copy.download}
        </a>
        {typeof ClipboardItem !== 'undefined' && (
          <button type="button" className="btn" onClick={() => copyImage(card('png')).then(() => toast(copy.imageCopied), (e: unknown) => toast(messageOf(e), 'error'))}>
            <ImageIcon size={15} strokeWidth={1.75} aria-hidden="true" />
            {copy.copyImage}
          </button>
        )}
        {link && (
          <a className="btn" href={`mailto:?subject=${encodeURIComponent(copy.mailSubject(line))}&body=${encodeURIComponent(link)}`}>
            <Mail size={15} strokeWidth={1.75} aria-hidden="true" />
            {copy.email}
          </a>
        )}
        <button type="button" className="btn ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <ThemeIcon size={15} strokeWidth={1.75} aria-hidden="true" />
          {theme === 'dark' ? copy.light : copy.dark}
        </button>
        {money && !shared && (
          <label className="ms-amount">
            <Switch on={amount} label={copy.showAmount} onChange={() => setAmount(!amount)} />
            {copy.showAmount}
          </label>
        )}
      </div>
    </Modal>
  )
}
