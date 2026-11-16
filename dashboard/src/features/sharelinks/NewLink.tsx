// The new-link form: what to call it, what it shows and, under More, who can
// open it and for how long. One form for Settings → Sharing and the Share
// dialog; Settings draws the page the link will open beside it, the dialog
// draws it in its own panel (and is told the options by onOptions).
import { Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fail, type Site, more } from '../../lib/apiMore'
import { copy } from './copy'
import { EMPTY, linkBody, previewOptions, problem, type Draft } from './logic'
import { LivePreview, type PreviewOptions } from './LivePreview'
import { Options } from './Options'

export interface Made {
  name: string
  url: string
  sites: string[]
}

interface Props {
  site: Site
  onClose: () => void
  onMade: (m: Made) => void
  /** Without the preview beside it: the host draws its own, from what this says. */
  bare?: boolean
  /** What the page shows, as it stands, and whether the link will ask for a password (the host's preview can then show that page). */
  onOptions?: (o: PreviewOptions, password: boolean) => void
}

export function NewLink({ site, onClose, onMade, bare, onOptions }: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const blocked = problem(draft)
  const options = previewOptions(draft, site.domain)
  const shown = JSON.stringify(options)
  const password = draft.access === 'password'
  useEffect(() => onOptions?.(options, password), [shown, password]) // eslint-disable-line react-hooks/exhaustive-deps -- options is rebuilt each render: told when its content changes

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
      {!bare && <LivePreview site={site.id} host={globalThis.location?.host ?? ''} options={options} lock={password ? locked : undefined} onLock={password ? () => setLocked((v) => !v) : undefined} />}
    </form>
  )
}
