// One note in the notes sheet: its words and day, with Edit and Delete for a person who may change notes. Editing is
// in place (the words), deleting asks once.
import { useState } from 'react'
import { confirm } from '../../components/Confirm'
import { toast } from '../../components/Toast'
import { fail, more, type Annotation } from '../../lib/apiMore'
import { copy } from '../../features/notes/listCopy'
import { dayWords } from '../dayWords'
import { InfoRow } from './InfoSheet'

export function NoteLine({ n, site, onChanged }: { n: Annotation; site: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(n.text)
  const [busy, setBusy] = useState(false)
  const save = () => {
    setBusy(true)
    more
      .updateAnnotation(site, n.id, n.day, text)
      .then(() => {
        toast(copy.saved)
        setEditing(false)
        onChanged()
      })
      .catch((e: unknown) => fail(e, save))
      .finally(() => setBusy(false))
  }
  const remove = () =>
    void confirm({ title: copy.removeTitle, body: copy.removeBody(n.text), confirmLabel: copy.remove, danger: true, busyLabel: copy.removing, done: copy.removed, run: () => more.deleteAnnotation(site, n.id) }).then((ok) => ok && onChanged())
  if (editing) {
    return (
      <form
        className="irow"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input required maxLength={140} autoFocus value={text} aria-label={copy.text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          setEditing(false)
        }} />
        <button type="button" className="xb" onClick={() => setEditing(false)}>
          {copy.cancel}
        </button>
        <button type="submit" className="xb p" disabled={busy || !text.trim()}>
          {copy.save}
        </button>
      </form>
    )
  }
  return (
    <InfoRow
      t={n.text}
      d={`${dayWords(n.day)}${n.author ? ` · ${n.author}` : ''}`}
      r={
        <>
          <button type="button" className="xb" aria-label={copy.editLabel(n.text)} onClick={() => setEditing(true)}>
            {copy.edit}
          </button>
          <button type="button" className="xb" aria-label={copy.removeLabel(n.text)} onClick={remove}>
            {copy.remove}
          </button>
        </>
      }
    />
  )
}
