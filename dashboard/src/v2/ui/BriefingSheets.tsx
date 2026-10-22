// The two sheets the Briefing opens over itself: the notes of the site, and tomorrow's email as it will read.
import { NoteLine } from './NoteLine'
import type { ReactNode } from 'react'
import type { Annotation } from '../../lib/api'
import { copy } from '../briefing/copy'
import { dayWords } from '../dayWords'
import { lockCopy } from './lockCopy'
import { InfoRow, InfoSheet } from './InfoSheet'

export function NotesSheet({ site, siteId, notes, onClose, onAdd, onChanged }: { site: string; siteId: string; notes: Annotation[]; onClose: () => void; onAdd?: () => void; onChanged: () => void }) {
  return (
    <InfoSheet
      title={copy.allNotes}
      sub={site}
      onClose={onClose}
      close={copy.close}
      foot={
        onAdd && (
          <button type="button" className="xb" onClick={onAdd}>
            {copy.addNote}
          </button>
        )
      }
    >
      {notes.length ? [...notes].reverse().map((n) => (onAdd ? <NoteLine key={n.id} n={n} site={siteId} onChanged={onChanged} /> : <InfoRow key={n.id} t={n.text} d={`${dayWords(n.day)}${n.author ? ` · ${n.author}` : ''}`} />)) : <div className="mk-quiet">
          {copy.noNotes}
          {!onAdd && <div>{lockCopy.ask}</div>}
        </div>}
    </InfoSheet>
  )
}

interface MailFact {
  n: string
  u: string
  t: string
}

export function MailSheet({ site, headline, facts, claims, on, onTime, onToggle, onClose }: { site: string; headline: string; facts: MailFact[]; claims: ReactNode[]; on: boolean; onTime: () => void; onToggle: () => void; onClose: () => void }) {
  return (
    <InfoSheet
      title={copy.mailPreview}
      sub={copy.mailWhen}
      onClose={onClose}
      close={copy.close}
      className="mailpv"
      foot={
        <>
          <button type="button" className="xb" onClick={onTime}>
            {copy.mailTime}
          </button>
          <button type="button" className="xb" data-mail="1" onClick={onToggle}>
            {on ? copy.turnOffMail : copy.turnOnMail}
          </button>
          <button type="button" className="xb p" onClick={onClose}>
            {copy.closePreview}
          </button>
        </>
      }
    >
      <div className="mh">
        <span>
          {copy.from} <b>{'trckable'}</b>
        </span>
        <span>
          {copy.subject} <b>{headline}</b>
        </span>
      </div>
      <h3>{headline}</h3>
      <div className="mfacts">
        {facts.map((f) => (
          <div key={f.u}>
            <b>{f.n}</b> <small>{f.u}</small>
            <span className="m">{f.t}</span>
          </div>
        ))}
      </div>
      <ul className="mcl">
        {claims.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      <p className="cdw">{copy.openFor(site)}</p>
    </InfoSheet>
  )
}
