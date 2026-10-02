// Every note of a site in one place: from the chart (a dialog) and from
// Settings (a section). Search by words, author or day; edit or delete one;
// click one to see its day on the chart. A lazy chunk: never in the first load.
import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, type Annotation, type Site } from '../../lib/api'
import { words } from '../../lib/errors'
import { fmtDay } from '../../lib/dates'
import { EmptyState } from '../../components/EmptyState'
import { Modal } from '../../components/Modal'
import { copy } from './listCopy'
import { NoteRow } from './NoteRow'
import './NotesList.css'

// Every day there is: a note is kept for as long as the site.
const ALL = { from: '0000-01-01', to: '9999-12-31' }

/** Whether a note matches a search: its words, its author or its day. */
export function matches(n: Annotation, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  const hay = [n.text, n.author ?? '', n.day, fmtDay(n.day, { year: true, weekday: true })].join(' ').toLowerCase()
  return t.split(/\s+/).every((w) => hay.includes(w))
}

/** The notes under one heading per day, in the order given. */
export function byDay(list: Annotation[]): [string, Annotation[]][] {
  const days = new Map<string, Annotation[]>()
  for (const n of list) days.set(n.day, [...(days.get(n.day) ?? []), n])
  return [...days]
}

export function NotesPanel({ site, onJump, onChanged, onAdd }: { site: Site; onJump: (day: string) => void; onChanged?: () => void; onAdd?: () => void }) {
  const [list, setList] = useState<Annotation[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const load = () =>
    api
      .annotations(site.id, ALL.from, ALL.to)
      .then((r) => {
        setErr(null)
        // The newest day first: the note looked for is usually recent.
        setList([...(r.annotations ?? [])].reverse())
      })
      .catch((e: unknown) => setErr(words(e)))
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is a new function every render; refetch only when the site changes
  }, [site.id])
  const changed = () => {
    void load()
    onChanged?.()
  }
  const shown = useMemo(() => (list ?? []).filter((n) => matches(n, q)), [list, q])

  return (
    <div className="notes-panel">
      <p className="muted notes-intro">{copy.intro}</p>
      <label className="menu-search notes-search">
        <Search size={17} strokeWidth={1.75} aria-hidden="true" />
        <input type="search" placeholder={copy.search} aria-label={copy.search} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <Body list={list} err={err} shown={shown} q={q} site={site} onJump={onJump} onChanged={changed} onAdd={onAdd} />
    </div>
  )
}

function Body(p: { list: Annotation[] | null; err: string | null; shown: Annotation[]; q: string; site: Site; onJump: (day: string) => void; onChanged: () => void; onAdd?: () => void }) {
  if (p.err)
    return (
      <p role="alert" className="notes-state">
        {copy.failed} {p.err}
      </p>
    )
  if (!p.list)
    return (
      <p className="faint notes-state" aria-busy="true">
        {copy.loading}
      </p>
    )
  if (!p.list.length) return <EmptyState line={copy.empty} action={copy.emptyAction} onAction={p.onAdd} />
  if (!p.shown.length) return <p className="faint notes-state">{copy.noMatch(p.q)}</p>
  return (
    <>
      <span className="faint notes-count" aria-live="polite">
        {copy.shown(p.shown.length, p.list.length)}
      </span>
      <div className="notes-list">
        {byDay(p.shown).map(([day, notes]) => (
          <section key={day} className="notes-day">
            <h3 className="notes-day-head num">{fmtDay(day, { year: true, weekday: true })}</h3>
            <ul aria-label={fmtDay(day, { year: true, weekday: true })}>
              {notes.map((n) => (
                <NoteRow key={n.id} n={n} site={p.site} onJump={p.onJump} onChanged={p.onChanged} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

/** The list over the dashboard, from the chart. Jumping closes it. */
export function NotesDialog({ site, onJump, onChanged, onClose, onAdd }: { site: Site; onJump: (day: string) => void; onChanged: () => void; onClose: () => void; onAdd?: () => void }) {
  return (
    <Modal label={copy.title} className="notes-modal" onClose={onClose}>
      <div className="notes-head">
        <h2>{copy.title}</h2>
        <button type="button" className="btn icon ghost" aria-label={copy.close} onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <NotesPanel
        site={site}
        onChanged={onChanged}
        onAdd={onAdd}
        onJump={(day) => {
          onClose()
          onJump(day)
        }}
      />
    </Modal>
  )
}
