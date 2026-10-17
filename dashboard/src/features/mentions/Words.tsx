import { Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from '../../components/Toast'
import { fail } from '../../lib/api'
import { trust } from './trustCopy'
import { isViewer } from '../../lib/me'
import { mentionsApi, type LookAlike, type Words as WordsValue } from './api'
import { LookAlikeNote, UncheckedNote } from './LookAlikeNote'
import { otherMeaning } from './lookAlike'
import { page } from './pageCopy'

/** The words searched for as chips: the ones a person added can be removed, and a + chip turns into an input to add one. */
export function Words({ site, words, onWords }: { site: string; words: WordsValue; onWords: (w: WordsValue) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [look, setLook] = useState<LookAlike | null>(null)
  const [unchecked, setUnchecked] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const viewer = isViewer()
  useEffect(() => {
    if (draft === '') input.current?.focus()
  }, [draft])
  const save = (added: string[], exclude: string[] = []) => {
    const excluded = [...words.rules.excluded, ...exclude.filter((x) => !words.rules.excluded.includes(x))]
    if (excluded.length > 20) {
      toast(trust.excludedFull(20), 'warning')
      return
    }
    setBusy(true)
    mentionsApi
      .setWords(site, added)
      .then(async (w) => {
        const rules = exclude.length > 0 ? await mentionsApi.setRules(site, { ...w.rules, excluded }) : w.rules
        onWords({ ...w, rules })
        setDraft(null)
        setLook(null)
        setUnchecked(null)
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  const add = () => {
    if (busy) return
    const w = (draft ?? '').trim()
    const fresh = w !== '' && words.added.length < words.max && !words.added.some((x) => x.toLowerCase() === w.toLowerCase())
    if (!fresh) {
      setDraft(null)
      return
    }
    setBusy(true)
    void otherMeaning(site, w)
      .then((m) => {
        if (m.kind === 'other') setLook(m.look)
        else if (m.kind === 'unchecked') setUnchecked(w)
        else save([...words.added, w])
      })
      .finally(() => setBusy(false))
  }
  return (
    <>
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
      {!viewer && words.added.length < words.max && (
        <li>
          {draft === null ? (
            <button type="button" className="mentions-word mp-plus" aria-label={page.addWord} title={page.addWord} onClick={() => setDraft('')}>
              <Plus size={14} aria-hidden="true" />
            </button>
          ) : (
            <input
              ref={input}
              className="mentions-word mp-chip-input"
              value={draft}
              maxLength={60}
              disabled={busy}
              aria-label={page.wordLabel}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={add}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add()
                if (e.key === 'Escape') setDraft(null)
              }}
            />
          )}
        </li>
      )}
    </ul>
    {unchecked && <UncheckedNote word={unchecked} onAdd={() => save([...words.added, unchecked])} onCancel={() => { setUnchecked(null); setDraft(null) }} />}
    {look && <LookAlikeNote look={look} onExclude={() => save([...words.added, look.word], look.suggest_exclude)} onOnly={() => save([...words.added, look.word])} onCancel={() => { setLook(null); setDraft(null) }} />}
    </>
  )
}
