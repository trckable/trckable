import { X } from 'lucide-react'
import { useState } from 'react'
import { fail } from '../../lib/api'
import { isViewer } from '../../lib/me'
import { mentionsApi, type Source, type Words } from './api'
import { copy } from './copy'
import { page } from './pageCopy'
import { SourceMark } from './SourceMark'

/** The words searched for as chips; the ones a person added can be removed or added to on the spot. */
function Chips({ site, words, onWords }: { site: string; words: Words; onWords: (w: Words) => void }) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const viewer = isViewer()
  const save = (added: string[]) => {
    setBusy(true)
    mentionsApi
      .setWords(site, added)
      .then((w) => {
        onWords(w)
        setDraft('')
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  const add = () => {
    const w = draft.trim()
    if (w && words.added.length < words.max && !words.added.some((x) => x.toLowerCase() === w.toLowerCase())) save([...words.added, w])
  }
  return (
    <div>
      <h3>{page.words}</h3>
      <ul className="mentions-words">
        {words.default.map((w) => (
          <li key={w} className="mentions-word fixed">
            {w}
          </li>
        ))}
        {words.added.map((w) => (
          <li key={w} className="mentions-word">
            {w}
            {!viewer && (
              <button type="button" aria-label={page.removeWord(w)} disabled={busy} onClick={() => save(words.added.filter((x) => x !== w))}>
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!viewer && (
        <form
          className="mentions-add"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={page.wordLabel} maxLength={60} />
          <button type="submit" className="btn ghost" disabled={busy || !draft.trim()}>
            {page.addWord}
          </button>
        </form>
      )}
    </div>
  )
}

/** Nothing found yet: what is watched, where, how often, and what a mention will look like. */
export function Empty({ site, words, sources, onWords }: { site: string; words: Words; sources: Source[]; onWords: (w: Words) => void }) {
  return (
    <section className="card mp-empty" aria-labelledby="mp-empty-h">
      <h2 id="mp-empty-h">{page.emptyTitle}</h2>
      <p className="muted">{page.emptyLead}</p>
      <Chips site={site} words={words} onWords={onWords} />
      <div>
        <h3>{page.where}</h3>
        <p className="mp-places">
          {sources.map((s) => (
            <span key={s}>
              <SourceMark source={s} /> {copy.name[s]}
            </span>
          ))}
        </p>
        <p className="muted">{page.every}</p>
      </div>
      <div className="mp-sample" aria-label={page.sample}>
        <p className="faint">{page.sampleNote}</p>
        <div className="mp-row quiet" aria-hidden="true">
          <SourceMark source="hn" />
          <div className="mp-main">
            <p className="mp-title">{page.sampleTitle}</p>
            <p className="mp-facts">{copy.name.hn}</p>
            <blockquote className="mp-quote">{page.sampleQuote}</blockquote>
          </div>
        </div>
      </div>
    </section>
  )
}
