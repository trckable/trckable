// One link, one compact row: who can open it, what it shows, how often it was
// opened, when it ends, and a way to revoke it. Only the notes can change on a
// link that exists (the server takes nothing else), so only they are a button.
import { CircleDollarSign, Clock, Code, Eye, Globe, Lock, Power, StickyNote } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from '../../components/Toast'
import { api, messageOf, type Share } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { copy, nameOf } from './copy'
import { endState } from './logic'

const day = (unix?: number | null) => (unix ? new Date(unix * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function Flag({ on, label, children }: { on: boolean; label: string; children: React.ReactNode }) {
  return (
    <span className={on ? 'sl-flag on' : 'sl-flag'} role="img" aria-label={label} title={`${label}. ${copy.fixed}`}>
      {children}
    </span>
  )
}

function endLabel(share: Share) {
  const state = endState(share)
  if (state === 'none') return copy.noEnd
  return state === 'past' ? copy.ended(day(share.expires_at)) : copy.ends(day(share.expires_at))
}

function Ends({ share }: { share: Share }) {
  const state = endState(share)
  const label = endLabel(share)
  return (
    <span className={state === 'past' ? 'sl-ends-col past' : 'sl-ends-col'} title={label}>
      <Clock size={13} strokeWidth={1.75} aria-hidden="true" />
      <span aria-hidden="true">{state === 'none' ? '∞' : new Date((share.expires_at ?? 0) * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
      <span className="sr">{label}</span>
    </span>
  )
}

function Notes({ site, share, readOnly, onChanged }: { site: string; share: Share; readOnly: boolean; onChanged: () => void }) {
  const on = !!share.notes
  const name = nameOf(share)
  if (readOnly)
    return (
      <Flag on={on} label={on ? copy.notesOn(name) : copy.notesOff(name)}>
        <StickyNote size={14} strokeWidth={1.75} />
      </Flag>
    )
  const flip = () =>
    api
      .updateShare(site, share.id, !on)
      .then(() => {
        toast(on ? copy.notesHidden : copy.notesShown)
        onChanged()
      })
      .catch((e: unknown) => toast(messageOf(e), 'error'))
  return (
    <button type="button" className={on ? 'sl-flag on' : 'sl-flag'} aria-pressed={on} aria-label={on ? copy.notesOn(name) : copy.notesOff(name)} title={copy.notesTip(on)} onClick={flip}>
      <StickyNote size={14} strokeWidth={1.75} />
    </button>
  )
}

function Revoke({ site, share, onDone }: { site: string; share: Share; onDone: () => void }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  // Escape steps back out of the question and nothing else: the dialog around it stays.
  useEffect(() => {
    if (!asking || busy) return
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setAsking(false)
    }
    document.addEventListener('keydown', esc, true)
    return () => document.removeEventListener('keydown', esc, true)
  }, [asking, busy])
  const go = () => {
    setBusy(true)
    api
      .deleteShare(site, share.id)
      .then(() => {
        toast(copy.revoked)
        onDone()
      })
      .catch((e: unknown) => {
        toast(messageOf(e), 'error')
        setBusy(false)
        setAsking(false)
      })
  }
  if (!asking)
    return (
      <button type="button" className="sl-icon danger" aria-label={copy.revoke(nameOf(share))} title={copy.revoke(nameOf(share))} onClick={() => setAsking(true)}>
        <Power size={15} strokeWidth={1.75} />
      </button>
    )
  return (
    <span className="sl-ask" role="group" aria-label={copy.revokeAsk}>
      <span>{copy.revokeAsk}</span>
      <button type="button" className="btn ghost small" autoFocus disabled={busy} onClick={() => setAsking(false)}>
        {copy.keep}
      </button>
      <button type="button" className="btn danger small" disabled={busy} onClick={go}>
        {busy ? copy.revoking : copy.revokeYes}
      </button>
    </span>
  )
}

export function LinkRow({ site, share, readOnly, onChanged }: { site: string; share: Share; readOnly: boolean; onChanged: () => void }) {
  const locked = share.has_password
  const embeds = share.embed_origins ?? []
  const seen = share.views > 0 ? copy.lastOpened(day(share.viewed_at)) : copy.neverOpened
  return (
    <li className="sl-row">
      <span className="sl-kind" role="img" aria-label={locked ? copy.rowPassword : copy.rowPublic} title={locked ? copy.rowPassword : copy.rowPublic}>
        {locked ? <Lock size={14} strokeWidth={1.75} /> : <Globe size={14} strokeWidth={1.75} />}
      </span>
      <span className="sl-name">{nameOf(share)}</span>
      <span className="sl-meta">
        <Flag on={share.revenue} label={share.revenue ? copy.revenueOn : copy.revenueOff}>
          <CircleDollarSign size={14} strokeWidth={1.75} />
        </Flag>
        <Notes site={site} share={share} readOnly={readOnly} onChanged={onChanged} />
        <Flag on={embeds.length > 0} label={embeds.length ? copy.embedOn(embeds) : copy.embedOff}>
          <Code size={14} strokeWidth={1.75} />
        </Flag>
        <span className="sl-views num" title={seen}>
          <Eye size={13} strokeWidth={1.75} aria-hidden="true" />
          <span aria-hidden="true">{share.views > 0 ? fmtInt(share.views) : '–'}</span>
          <span className="sr">
            {copy.viewsLabel(share.views)}. {seen}
          </span>
        </span>
        <Ends share={share} />
      </span>
      {!readOnly && <Revoke site={site} share={share} onDone={onChanged} />}
    </li>
  )
}
