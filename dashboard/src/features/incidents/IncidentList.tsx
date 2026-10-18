// The incidents of the period, newest first: how long, which kind, when, the visits it probably cost and what our checks
// saw. An owner can write a short note on one ("Hosting migration"); a viewer only reads.
import { useState } from 'react'
import { AskAbout } from '../../components/Ask'
import { isViewer } from '../../lib/me'
import { fmtInt } from '../../lib/format'
import { when } from '../sitestatus/time'
import { incidents, type Incident } from './api'
import { copy } from './copy'
import { duration, lasted } from './model'

function Note({ site, x, onSaved }: { site: string; x: Incident; onSaved: (x: Incident) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(x.note)
  const [failed, setFailed] = useState(false)
  const save = () => {
    incidents.note(site, x.id, text).then(
      (y) => {
        onSaved(y)
        setEditing(false)
        setFailed(false)
      },
      () => setFailed(true),
    )
  }
  if (editing) {
    return (
      <form
        className="inc-note-form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input aria-label={copy.noteLabel} value={text} maxLength={140} placeholder={copy.notePlaceholder} autoFocus onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn primary">{copy.save}</button>
        <button type="button" className="btn ghost" onClick={() => { setEditing(false); setText(x.note); setFailed(false) }}>{copy.cancel}</button>
        {failed && <small className="inc-fail" role="alert">{copy.noteFailed}</small>}
      </form>
    )
  }
  return (
    <p className="inc-note">
      {x.note && <span>{x.note}</span>}
      {!isViewer() && (
        <button type="button" className="linkish" onClick={() => setEditing(true)}>
          {x.note ? copy.editNote : copy.addNote}
        </button>
      )}
    </p>
  )
}

/** What the checks saw of a quiet spell: the page is only said to have answered when a look after the last visit found it so. */
const seenOf = (x: Incident) => (x.cause.endsWith('page answered') ? `${copy.seenQuiet} ${copy.seenAnswered}` : copy.seenQuiet)

function Row({ x, now, domain, onSaved }: { x: Incident; now: number; domain?: string; onSaved: (x: Incident) => void }) {
  const kind = x.kind === 'down' ? copy.down : copy.quiet
  const span = duration(lasted(x, now))
  const range = x.ended_at ? copy.from(when(x.started_at), when(x.ended_at)) : copy.ongoing(when(x.started_at))
  const title = (x.ended_at ? copy.row : copy.rowOpen)(kind, span)
  const saw = x.kind === 'down' ? x.cause : seenOf(x)
  return (
    <li className={'inc-row ' + x.kind}>
      <div className="inc-row-head">
        <b>{title}</b>
        <AskAbout about={{ title, domain, facts: [range, saw], question: copy.askWhat(kind) }} />
        <span className="inc-when">{range}</span>
      </div>
      <p className="inc-saw">
        <span>{copy.seen}: {saw}</span>
        {x.expected_visits !== null && <span className="inc-lost">{copy.expected(fmtInt(x.expected_visits))}</span>}
      </p>
      <Note site={x.site} x={x} onSaved={onSaved} />
    </li>
  )
}

export function IncidentList({ domain, list, now, edit }: { domain?: string; list: Incident[]; now: number; edit: (x: Incident) => void }) {
  return (
    <section aria-label={copy.list}>
      <ul className="inc-rows">
        {list.map((x) => (
          <Row key={x.id} x={x} now={now} domain={domain} onSaved={edit} />
        ))}
      </ul>
    </section>
  )
}
