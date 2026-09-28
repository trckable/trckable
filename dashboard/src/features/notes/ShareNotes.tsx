// A share link's notes switch: off unless the owner turns it on, since a note
// can say more than the numbers. On a new link (a field) and on an existing
// one (its ⋯ menu). The server decides; the page only asks.
import { api, messageOf, type Share, type Site } from '../../lib/api'
import { Switch } from '../../components/Switch'
import { toast } from '../../components/Toast'
import { copy } from './listCopy'

export const notesTag = copy.shareTag

export function ShareNotesField({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div className="field">
      <span>{copy.shareLabel}</span>
      <Switch on={on} label={copy.shareLabel} onChange={onChange} />
      <span className="faint" style={{ fontSize: 12 }}>
        {on ? copy.shareOn : copy.shareOff}
      </span>
    </div>
  )
}

export function ShareNotesItem({ site, share, close, onChanged }: { site: Site; share: Share; close: () => void; onChanged: () => void }) {
  const next = !share.notes
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        close()
        api
          .updateShare(site.id, share.id, next)
          .then(() => {
            toast(next ? copy.shareShown : copy.shareHidden)
            onChanged()
          })
          .catch((e: unknown) => toast(messageOf(e), 'error'))
      }}
    >
      {next ? copy.shareShow : copy.shareHide}
    </button>
  )
}
