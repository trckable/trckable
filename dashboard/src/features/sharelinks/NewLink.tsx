// The new-link form: what to call it, what it shows and, under More, who can
// open it and for how long. One form for Settings → Sharing and the Share
// dialog; Settings draws a picture of the result beside it, the dialog has
// its own preview of the page.
import { Link2 } from 'lucide-react'
import { useState } from 'react'
import { fail, type Site, more } from '../../lib/apiMore'
import { copy } from './copy'
import { EMPTY, linkBody, problem, type Draft } from './logic'
import { Options } from './Options'
import { usePreviewNumbers } from './numbers'
import { Preview } from './Preview'

export interface Made {
  name: string
  url: string
  sites: string[]
}

interface Props {
  site: Site
  onClose: () => void
  onMade: (m: Made) => void
  /** Without the picture of the result: the host shows its own. */
  bare?: boolean
}

export function NewLink({ site, onClose, onMade, bare }: Props) {
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
    more
      .createShare(site.id, body)
      .then((r) => onMade({ name: body.name, url: r.url, sites: body.embed_origins }))
      .catch((e: unknown) => {
        fail(e, create)
        setBusy(false)
      })
  }

  return (
    <form
      className={bare ? 'sl-new bare' : 'sl-new'}
      onSubmit={(e) => {
        e.preventDefault()
        create()
      }}
    >
      <div className="sl-fields">
        <input className="input" aria-label={copy.name} placeholder={site.domain} maxLength={60} value={draft.name} autoFocus onChange={(e) => set({ name: e.target.value })} />
        <Options draft={draft} set={set} blocked={blocked} />
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
      {!bare && <Preview draft={draft} numbers={numbers} domain={site.domain} lockShown={lockShown} onLock={() => setLockShown((v) => !v)} />}
    </form>
  )
}
