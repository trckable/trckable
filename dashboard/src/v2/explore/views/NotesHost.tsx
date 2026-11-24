// The period's notes: the list and the dialog to add one open from the header's ⋯ menu (and from the chart's note flags), so nothing for them sits on the page.
import { lazy, Suspense, useEffect, useState } from 'react'
import type { Annotation, Site } from '../../../lib/api'
import { isShared } from '../../../lib/me'
import { can } from '../../../lib/permissions'
import { NotesSheet } from '../../ui/BriefingSheets'

const NoteDialog = lazy(() => import('../../../components/NoteDialog').then((m) => ({ default: m.NoteDialog })))

/** Asks the page to open the period's notes (the ⋯ menu sends it). */
export const NOTES_EVENT = 'trckable:notes'

export function NotesHost({ site, to, notes, onChanged, sheet, setSheet }: { site: Site; to: string; notes: Annotation[]; onChanged: () => void; sheet: boolean; setSheet: (on: boolean) => void }) {
  const [add, setAdd] = useState(false)
  const canNote = can('note.write') && !isShared()
  useEffect(() => {
    const open = () => canNote && setAdd(true)
    const list = () => setSheet(true)
    window.addEventListener('trckable:note', open)
    window.addEventListener(NOTES_EVENT, list)
    return () => {
      window.removeEventListener('trckable:note', open)
      window.removeEventListener(NOTES_EVENT, list)
    }
  }, [canNote, setSheet])
  // The sheet was opened from the ⋯ menu, which has closed: focus goes back to the button that opened it.
  const close = () => {
    setSheet(false)
    document.querySelector<HTMLElement>('[data-xm=more]')?.focus()
  }
  if (isShared()) return null
  return (
    <>
      {sheet && <NotesSheet site={site.domain} siteId={site.id} notes={notes} onChanged={onChanged} onClose={close} onAdd={canNote ? () => setAdd(true) : undefined} />}
      {add && (
        <Suspense fallback={null}>
          <NoteDialog site={site} day={to} today={to} days={[]} notes={notes} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); onChanged() }} />
        </Suspense>
      )}
    </>
  )
}
