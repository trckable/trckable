// Editing a widget that exists: its real rendering large, with every setting
// of the studio beside it. Save keeps the same id, so the code on the owner's
// pages keeps working and shows the change; Cancel keeps the old version.
import { useState } from 'react'
import { DialogActions } from '../components/DialogActions'
import { DialogHead } from '../components/DialogHead'
import { Modal } from '../kit/Modal'
import { toast } from '../components/Toast'
import { fail, type Site, type Widget, type WidgetLook, more } from '../lib/apiMore'
import { TEXT, placeOf, type Place } from './widgetKinds'
import { WidgetStudio } from './WidgetStudio'

export function WidgetEditor({ site, w, onClose, onSaved }: { site: Site; w: Widget; onClose: () => void; onSaved: () => void }) {
  const [look, setLook] = useState<WidgetLook>({ name: w.name, kind: w.kind, theme: w.theme, accent: w.accent, radius: w.radius, brand: w.brand, lang: w.lang, texts: w.texts, shows: w.shows })
  const [place, setPlace] = useState<Place>(w.kind === 'online' ? placeOf(w.shows) : 'inline')
  const [busy, setBusy] = useState(false)
  const save = () => {
    setBusy(true)
    more
      .updateWidget(site.id, w.id, { ...look, name: look.name?.trim(), on: w.on })
      .then(() => {
        toast(TEXT.saved)
        onSaved()
        onClose()
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  return (
    <Modal label={TEXT.editTitle} className="wg-modal" onClose={busy ? undefined : onClose}>
      <DialogHead heading={w.name} help={TEXT.editHint} />
      <WidgetStudio
        site={site}
        look={look}
        onLook={(patch) => setLook((l) => ({ ...l, ...patch }))}
        place={place}
        onPlace={setPlace}
        footer={
          <DialogActions
            left={
              <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>
                {TEXT.cancel}
              </button>
            }
          >
            <button type="button" className="btn primary" disabled={busy} onClick={save}>
              {busy && <span className="btn-spin" aria-hidden="true" />}
              {busy ? TEXT.saving : TEXT.save}
            </button>
          </DialogActions>
        }
      />
    </Modal>
  )
}
