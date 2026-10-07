// Making a widget: a dialog with the studio, and after Make this widget the
// code to paste, in the same dialog. Opened by "New widget" on the page.
import { useState } from 'react'
import { CodeBlock } from '../components/Code'
import { DialogActions } from '../components/DialogActions'
import { DialogHead } from '../components/DialogHead'
import { Modal } from '../kit/Modal'
import { toast } from '../components/Toast'
import { fail, more, type Site, type Widget, type WidgetLook } from '../lib/apiMore'
import { EMPTY_LOOK, TEXT, cornerCode, frameCode, snippet, type Place } from './widgetKinds'
import { WidgetStudio } from './WidgetStudio'

export function WidgetCreator({ site, base, onClose, onMade }: { site: Site; base: string; onClose: () => void; onMade: () => void }) {
  const [look, setLook] = useState<WidgetLook>(EMPTY_LOOK)
  const [place, setPlace] = useState<Place>('inline')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<Widget | null>(null)
  const create = () => {
    setBusy(true)
    more
      .createWidget(site.id, { ...look, name: look.name?.trim() })
      .then((w) => {
        setMade(w)
        onMade()
        toast(TEXT.ready)
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  return (
    <Modal label={TEXT.newWidget} className="wg-modal" onClose={busy ? undefined : onClose}>
      <DialogHead heading={made ? TEXT.ready : TEXT.newWidget} help={TEXT.pageHint} />
      {made ? (
        <div className="wg-made">
          <b>{TEXT.frame}</b>
          <CodeBlock code={made.kind === 'online' ? frameCode(base, made, site.domain) : snippet(base, made, site.domain, place)} lang="html" wrap />
          {made.kind === 'online' && (
            <>
              <b>{TEXT.corner}</b>
              <CodeBlock code={cornerCode(base, made)} lang="html" wrap />
            </>
          )}
          <DialogActions>
            <button type="button" className="btn primary" onClick={onClose}>
              {TEXT.done}
            </button>
          </DialogActions>
        </div>
      ) : (
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
              <button type="button" className="btn primary" disabled={busy} onClick={create}>
                {busy && <span className="btn-spin" aria-hidden="true" />}
                {TEXT.make[busy ? 1 : 0]}
              </button>
            </DialogActions>
          }
        />
      )}
    </Modal>
  )
}
