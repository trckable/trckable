// The popup behind a person's ⋯ → Allowed sites: All sites, or the ones
// ticked. Nothing changes until Save; Cancel and Escape leave it as it was.
import { Check, Grid2x2, Users } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../kit/Modal'
import { ModalMark } from '../../kit/ModalMark'
import { SiteMark } from '../../components/SiteMark'
import { Switch } from '../../components/Switch'
import { fail, type SiteAccessList } from '../../lib/api'
import { copy } from './copy'
import { changed } from './draft'
import './access.css'

type Viewer = SiteAccessList['viewers'][number]

export default function AccessDialog({ viewer, sites, onSave, onClose }: { viewer: Viewer; sites: SiteAccessList['sites']; onSave: (sites: string[] | null) => Promise<unknown>; onClose: () => void }) {
  const [all, setAll] = useState(viewer.sites === null)
  const [chosen, setChosen] = useState(() => new Set(viewer.sites ?? []))
  const [busy, setBusy] = useState(false)
  const toggle = (id: string) =>
    setChosen((was) => {
      const next = new Set(was)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      // In the server's own order, whatever order they were ticked in.
      await onSave(all ? null : sites.filter((s) => chosen.has(s.id)).map((s) => s.id))
      onClose()
    } catch (err) {
      fail(err)
      setBusy(false)
    }
  }
  const dirty = changed(viewer.sites, all ? null : [...chosen])
  return (
    <Modal
      label={copy.editFor(viewer.email)}
      onClose={busy ? undefined : onClose}
      frame={{
        title: copy.menuItem,
        subtitle: viewer.email,
        icon: <ModalMark icon={Users} />,
        size: 'sm',
        busy,
        cancel: copy.cancel,
        extra: (
          <span className="access-count faint num">{copy.count(all ? sites.length : chosen.size, sites.length)}</span>
        ),
        onSubmit: () => void submit(),
        actions: (
          <button type="submit" className="btn primary" disabled={busy || !dirty}>
            <Check size={14} strokeWidth={2} aria-hidden="true" />
            {busy ? copy.saving : copy.save}
          </button>
        ),
      }}
    >
    <div className="access-all">
      <span className="access-all-label">
        <Grid2x2 size={16} strokeWidth={1.75} aria-hidden="true" />
        {copy.allToggle}
      </span>
      <Switch on={all} label={copy.allToggle} disabled={busy} onChange={() => setAll((a) => !a)} />
    </div>
    <fieldset className="access-sites" aria-label={copy.sitesLabel} disabled={all || busy}>
      {sites.map((s) => (
        <label key={s.id} className="access-site">
          <input type="checkbox" checked={all || chosen.has(s.id)} onChange={() => toggle(s.id)} />
          <SiteMark site={{ domain: s.domain }} size={20} />
          <span className="access-name" title={s.name || s.domain}>
            {s.name || s.domain}
          </span>
          {s.name && s.name !== s.domain && (
            <span className="faint access-domain" title={s.domain}>
              {s.domain}
            </span>
          )}
        </label>
      ))}
    </fieldset>
    </Modal>
  )
}
