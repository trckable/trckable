// Settings → Mentions: the words Hacker News, Product Hunt and the news are
// searched for. The address and the site's name are always searched; up to ten
// more can be added. Saved with one button, so a half-typed list never goes out.
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from '../../components/Toast'
import { Field } from '../../components/Field'
import { fail, type Site } from '../../lib/api'
import { isViewer } from '../../lib/me'
import { mentionsApi, type LookAlike, type Rules, type Source, type Words } from './api'
import { LookAlikeNote, UncheckedNote } from './LookAlikeNote'
import { RulesEditor } from './RulesEditor'
import { otherMeaning } from './lookAlike'
import { trust } from './trustCopy'
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
  const [rules, setRules] = useState<Rules | null>(null)
  const [look, setLook] = useState<LookAlike | null>(null)
  const [unchecked, setUnchecked] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    mentionsApi
      .list(site.id, '7d')
      .then((r) => {
        setWords(r.words)
        setRules(r.words.rules)
        setAdded(r.words.added)
        setSources(r.sources)
      })
      .catch(() => setWords(null))
  }, [site.id])
  if (!words || !rules) return null
  const viewer = isViewer()
  const put = (w: string) => {
    if (w && !added.some((x) => x.toLowerCase() === w.toLowerCase()) && added.length < words.max) setAdded([...added, w])
    setDraft('')
    setLook(null)
    setUnchecked(null)
  }
  // A new name is checked against the news first: if headlines use it for something else, say so.
  const add = (name = draft) => {
    const w = name.trim()
    if (!w) return
    setChecking(true)
    void otherMeaning(site.id, w)
      .then((m) => {
        if (m.kind === 'other') setLook(m.look)
        else if (m.kind === 'unchecked') setUnchecked(w)
        else put(w)
      })
      .finally(() => setChecking(false))
  }
  // The name and the words to exclude are saved together, so one never goes in without the other.
  const addAndExclude = () => {
    if (!look) return
    const excluded = [...rules.excluded, ...look.suggest_exclude.filter((x) => !rules.excluded.includes(x))]
    if (excluded.length > 20 || added.length >= words.max) {
      toast(trust.excludedFull(20), 'warning')
      return
    }
    setBusy(true)
    mentionsApi
      .setWords(site.id, [...added, look.word])
      .then(async (w) => {
        const r = await mentionsApi.setRules(site.id, { ...rules, excluded })
        setWords({ ...w, rules: r })
        setAdded(w.added)
        setRules(r)
        setLook(null)
        setDraft('')
        toast(copy.settings.saved)
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
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
                <button type="button" className="btn" disabled={checking || !draft.trim() || added.length >= words.max} onClick={() => add()}>
                  {copy.settings.add}
                </button>
              </div>
            )}
          </Field>
          {checking && <p className="muted">{trust.checking}</p>}
          {unchecked && <UncheckedNote word={unchecked} onAdd={() => put(unchecked)} onCancel={() => setUnchecked(null)} />}
          {look && <LookAlikeNote look={look} onExclude={addAndExclude} onOnly={() => put(look.word)} onCancel={() => setLook(null)} />}
          {words.suggested.length > 0 && (
            <p className="muted mp-suggest">
              {trust.suggestedHelp}{' '}
              {words.suggested.map((n) => (
                <button key={n} type="button" className="btn ghost" disabled={checking || added.length >= words.max} onClick={() => add(n)}>
                  {trust.suggested(n)}
                </button>
              ))}
            </p>
          )}
          <button type="button" className="btn primary" disabled={busy || sameList(added, words.added)} onClick={save}>
            {busy ? copy.settings.saving : copy.settings.save}
          </button>
        </>
      )}
      <RulesEditor site={site.id} saved={words.rules} draft={rules} readOnly={viewer} onDraft={setRules} onSaved={(r) => { setRules(r); setWords({ ...words, rules: r }) }} />
    </section>
  )
}
