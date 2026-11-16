// A link that exists, opened for changes under its row: the same fields as
// the new-link form, with what the link has now. Only what changed is sent.
import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from '../../components/Toast'
import { fail, type Share, more } from '../../lib/apiMore'
import { copy, nameOf } from './copy'
import { draftOf, patchBody, problem, type Draft } from './logic'
import { Options } from './Options'

export function LinkEdit({ site, share, onClose, onSaved }: { site: string; share: Share; onClose: () => void; onSaved: () => void }) {
  const was = useMemo(() => draftOf(share), [share])
  const [draft, setDraft] = useState<Draft>(was)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const blocked = problem(draft, new Date(), was)
  const body = patchBody(was, draft)
  const changed = Object.keys(body).length > 0

  const save = () => {
    if (blocked || busy || !changed) return
    setBusy(true)
    more
      .updateShare(site, share.id, body)
      .then(() => {
        toast(copy.saved)
        onSaved()
        onClose()
      })
      .catch((e: unknown) => {
        fail(e, save)
        setBusy(false)
      })
  }

  return (
    <li className="sl-edit">
      <form
        className="sl-fields"
        aria-label={copy.editRow(nameOf(share))}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input className="input" aria-label={copy.name} placeholder={share.name ? undefined : copy.fallbackName} maxLength={60} value={draft.name} autoFocus onChange={(e) => set({ name: e.target.value })} />
        <Options editing draft={draft} set={set} blocked={blocked} />
        <div className="sl-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {copy.cancel}
          </button>
          <button type="submit" className="btn primary" disabled={busy || !!blocked || !changed} title={blocked?.text}>
            <Check size={15} strokeWidth={1.75} aria-hidden="true" />
            {busy ? copy.saving : copy.save}
          </button>
        </div>
      </form>
    </li>
  )
}
