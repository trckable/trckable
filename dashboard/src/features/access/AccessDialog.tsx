// The popup behind a person's ⋯ → Allowed sites: All sites, or the ones
// ticked. Nothing changes until Save; Cancel and Escape leave it as it was.
import { useState, type SyntheticEvent } from 'react'
import { DialogActions } from '../../components/DialogActions'
import { DialogHead } from '../../components/DialogHead'
import { Modal } from '../../components/Modal'
import { Switch } from '../../components/Switch'
import { messageOf, type SiteAccessList } from '../../lib/api'
import { copy } from './copy'
import { changed } from './draft'
import './access.css'

type Viewer = SiteAccessList['viewers'][number]

export default function AccessDialog({ viewer, sites, onSave, onClose }: { viewer: Viewer; sites: SiteAccessList['sites']; onSave: (sites: string[] | null) => Promise<unknown>; onClose: () => void }) {
  const [all, setAll] = useState(viewer.sites === null)
  const [chosen, setChosen] = useState(() => new Set(viewer.sites ?? []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toggle = (id: string) =>
    setChosen((was) => {
      const next = new Set(was)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const submit = async (e: SyntheticEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      // In the server's own order, whatever order they were ticked in.
      await onSave(all ? null : sites.filter((s) => chosen.has(s.id)).map((s) => s.id))
      onClose()
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }
  const dirty = changed(viewer.sites, all ? null : [...chosen])
  return (
    <Modal label={copy.editFor(viewer.email)} className="access-dialog" keepSize={false} onClose={busy ? undefined : onClose}>
      <form onSubmit={submit}>
        <DialogHead heading={copy.menuItem} hint={viewer.email} />
        <div className="access-all">
          <span>{copy.allToggle}</span>
          <Switch on={all} label={copy.allToggle} disabled={busy} onChange={() => setAll((a) => !a)} />
        </div>
        <fieldset className="access-sites" aria-label={copy.sitesLabel} disabled={all || busy}>
          {sites.map((s) => (
            <label key={s.id} className="access-site">
              <input type="checkbox" checked={all || chosen.has(s.id)} onChange={() => toggle(s.id)} />
              <span>{s.name || s.domain}</span>
              {s.name && s.name !== s.domain && <span className="faint">{s.domain}</span>}
            </label>
          ))}
        </fieldset>
        {error && (
          <p className="access-error" role="alert">
            {error}
          </p>
        )}
        <DialogActions
          left={
            <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>
              {copy.cancel}
            </button>
          }
        >
          <button type="submit" className="btn primary" disabled={busy || !dirty}>
            {busy ? copy.saving : copy.save}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
