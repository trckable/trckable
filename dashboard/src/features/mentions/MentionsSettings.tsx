// Settings → Mentions: the words Hacker News, Product Hunt and the news are
// searched for. The address and the site's name are always searched; up to ten
// more can be added. Saved with one button, so a half-typed list never goes out.
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from '../../components/Toast'
import { Field } from '../../components/Field'
import { fail, type Site } from '../../lib/api'
import { isViewer } from '../../lib/me'
import { mentionsApi, type Source, type Words } from './api'
import { copy } from './copy'
import { placesOf } from './model'
import './mentions.css'

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => w === b[i])

export default function MentionsSettings({ site }: { site: Site }) {
  const [words, setWords] = useState<Words | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [added, setAdded] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    mentionsApi
      .list(site.id, '7d')
      .then((r) => {
        setWords(r.words)
        setAdded(r.words.added)
        setSources(r.sources)
      })
      .catch(() => setWords(null))
  }, [site.id])
  if (!words) return null
  const viewer = isViewer()
  const add = () => {
    const w = draft.trim()
    if (w && !added.some((x) => x.toLowerCase() === w.toLowerCase()) && added.length < words.max) setAdded([...added, w])
    setDraft('')
  }
  const save = () => {
    setBusy(true)
    mentionsApi
      .setWords(site.id, added)
      .then((w) => {
        setWords(w)
        setAdded(w.added)
        toast(copy.settings.saved)
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  return (
    <section className="card mentions-set">
      <h3>{copy.title}</h3>
      <p className="muted">{copy.settings.intro(placesOf(sources))}</p>
      <div>
        <p className="muted">{copy.settings.always}</p>
        <ul className="mentions-words">
          {words.default.map((w) => (
            <li key={w} className="mentions-word fixed">
              {w}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="muted">{copy.settings.yours}</p>
        {added.length === 0 && <p className="muted">{copy.settings.none}</p>}
        <ul className="mentions-words">
          {added.map((w) => (
            <li key={w} className="mentions-word">
              {w}
              {!viewer && (
                <button type="button" aria-label={copy.settings.remove(w)} onClick={() => setAdded(added.filter((x) => x !== w))}>
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {!viewer && (
        <>
          <Field label={copy.settings.label} help={added.length >= words.max ? copy.settings.full(words.max) : copy.settings.hint(words.max)}>
            {(p) => (
              <div className="mentions-add">
                <input
                  {...p}
                  className="input"
                  value={draft}
                  maxLength={60}
                  disabled={added.length >= words.max}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      add()
                    }
                  }}
                />
                <button type="button" className="btn" disabled={!draft.trim() || added.length >= words.max} onClick={add}>
                  {copy.settings.add}
                </button>
              </div>
            )}
          </Field>
          <button type="button" className="btn primary" disabled={busy || sameList(added, words.added)} onClick={save}>
            {busy ? copy.settings.saving : copy.settings.save}
          </button>
        </>
      )}
    </section>
  )
}
