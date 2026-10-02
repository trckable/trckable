// One note in the list: its words, day and author; a click shows the day on
// the chart; edit in place; delete behind the one confirmation dialog.
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { fail, type Annotation, type Site, more } from '../../lib/apiMore'
import { isViewer } from '../../lib/me'
import { confirm } from '../../components/Confirm'
import { toast } from '../../components/Toast'
import { copy } from './listCopy'

export function NoteRow({ n, site, onJump, onChanged }: { n: Annotation; site: Site; onJump: (day: string) => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <NoteEdit n={n} site={site} onDone={() => setEditing(false)} onChanged={onChanged} />
  const remove = () =>
    confirm({
      title: copy.removeTitle,
      body: copy.removeBody(n.text),
      confirmLabel: copy.remove,
      danger: true,
      busyLabel: copy.removing,
      done: copy.removed,
      run: () => more.deleteAnnotation(site.id, n.id),
    }).then((ok) => ok && onChanged())
  return (
    <li className="note-row">
      <button type="button" className="note-jump" aria-label={`${n.text}. ${copy.jump(n.day)}`} onClick={() => onJump(n.day)}>
        <span className="note-text">{n.text}</span>
        {n.author && <span className="faint note-author">{copy.by(n.author)}</span>}
      </button>
      {!isViewer() && (
        <span className="note-actions">
          <button type="button" className="btn icon ghost" aria-label={copy.editLabel(n.text)} title={copy.edit} onClick={() => setEditing(true)}>
            <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button type="button" className="btn icon ghost danger-hover" aria-label={copy.removeLabel(n.text)} title={copy.remove} onClick={() => void remove()}>
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </span>
      )}
    </li>
  )
}

function NoteEdit({ n, site, onDone, onChanged }: { n: Annotation; site: Site; onDone: () => void; onChanged: () => void }) {
  const [day, setDay] = useState(n.day)
  const [text, setText] = useState(n.text)
  const [busy, setBusy] = useState(false)
  // Escape leaves the edit, not the dialog around it.
  const esc = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    onDone()
  }
  const save = () => {
    setBusy(true)
    more
      .updateAnnotation(site.id, n.id, day, text)
      .then(() => {
        toast(copy.saved)
        onDone()
        onChanged()
      })
      .catch((e: unknown) => fail(e, save))
      .finally(() => setBusy(false))
  }
  return (
    <li className="note-row editing">
      <form
        className="note-form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label className="field">
          {copy.day}
          <input className="input num" type="date" required value={day} onKeyDown={esc} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="field note-form-text">
          {copy.text}
          <input className="input" required maxLength={140} autoFocus value={text} onKeyDown={esc} onChange={(e) => setText(e.target.value)} />
        </label>
        <span className="note-form-actions">
          <button type="button" className="btn ghost" onClick={onDone}>
            {copy.cancel}
          </button>
          <button type="submit" className="btn primary" disabled={busy || !text.trim()}>
            {busy ? copy.saving : copy.save}
          </button>
        </span>
      </form>
    </li>
  )
}
