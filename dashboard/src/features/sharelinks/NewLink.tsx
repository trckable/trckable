// The new-link form, in the card: what to call it, who can open it, what it
// shows and for how long, with a picture of the result beside it.
import { Globe, Link2, Lock } from 'lucide-react'
import { useState } from 'react'
import { api, fail, type Site } from '../../lib/api'
import { copy } from './copy'
import { EMPTY, linkBody, problem, type Access, type Draft } from './logic'
import { Options } from './Options'
import { usePreviewNumbers } from './numbers'
import { Preview } from './Preview'

export interface Made {
  name: string
  url: string
  sites: string[]
}

const ACCESS: { id: Access; label: string; icon: typeof Globe }[] = [
  { id: 'public', label: copy.public, icon: Globe },
  { id: 'password', label: copy.password, icon: Lock },
]

export function NewLink({ site, onClose, onMade }: { site: Site; onClose: () => void; onMade: (m: Made) => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [lockShown, setLockShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const numbers = usePreviewNumbers(site)
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const blocked = problem(draft)

  const create = () => {
    if (blocked || busy) return
    const body = linkBody(draft, site.domain)
    setBusy(true)
    api
      .createShare(site.id, body)
      .then((r) => onMade({ name: body.name, url: r.url, sites: body.embed_origins }))
      .catch((e: unknown) => {
        fail(e, create)
        setBusy(false)
      })
  }

  return (
    <form
      className="sl-new"
      onSubmit={(e) => {
        e.preventDefault()
        create()
      }}
    >
      <div className="sl-fields">
        <input className="input" aria-label={copy.name} placeholder={copy.namePlaceholder} maxLength={60} value={draft.name} autoFocus onChange={(e) => set({ name: e.target.value })} />
        <div className="seg sl-access" role="group" aria-label={copy.mode}>
          {ACCESS.map((a) => (
            <button key={a.id} type="button" aria-pressed={draft.access === a.id} onClick={() => set({ access: a.id })}>
              <a.icon size={14} strokeWidth={1.75} aria-hidden="true" />
              {a.label}
            </button>
          ))}
        </div>
        {draft.access === 'password' && (
          <input className="input" type="password" aria-label={copy.password} autoComplete="new-password" value={draft.password} onChange={(e) => set({ password: e.target.value })} />
        )}
        <Options draft={draft} set={set} />
        <div className="sl-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {copy.cancel}
          </button>
          <button type="submit" className="btn primary" disabled={busy || !!blocked} title={blocked?.text}>
            <Link2 size={15} strokeWidth={1.75} aria-hidden="true" />
            {busy ? copy.creating : copy.create}
          </button>
        </div>
      </div>
      <Preview draft={draft} numbers={numbers} domain={site.domain} lockShown={lockShown} onLock={() => setLockShown((v) => !v)} />
    </form>
  )
}
