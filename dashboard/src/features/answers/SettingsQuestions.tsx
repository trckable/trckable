// Settings → Answers, the questions: add with Enter, edit, turn off, remove, or take a suggestion. Saved with one button.
import { Ghost, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { answersCopy as c } from './copy'

export interface Q {
  /** Kept by the server once saved; a new question has none yet. */
  id?: number
  key: string
  text: string
  active: boolean
}

let seq = 0
export const newKey = () => `n${++seq}`

interface Props {
  list: Q[]
  onList: (l: Q[]) => void
  max: number
  words: string[]
  suggestions: string[]
  viewer: boolean
}

/** Whether the text holds a word the site is found by (the server refuses it too). */
const names = (text: string, words: string[]) => {
  const low = text.toLowerCase()
  return words.some((w) => w.length > 1 && low.includes(w.toLowerCase()))
}

export function SettingsQuestions({ list, onList, max, words, suggestions, viewer }: Props) {
  const [draft, setDraft] = useState('')
  const [edit, setEdit] = useState<string | null>(null)
  const [ask, setAsk] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const full = list.length >= max
  const own = names(draft, words)
  const add = (text: string) => {
    const t = text.trim()
    if (t.length < 8 || full || names(t, words)) return
    onList([...list, { key: newKey(), text: t, active: true }])
    setDraft('')
  }
  const set = (key: string, p: Partial<Q>) => onList(list.map((q) => (q.key === key ? { ...q, ...p } : q)))
  const left = suggestions.filter((s) => !list.some((q) => q.text === s))
  return (
    <div className="an-set">
      <div className="an-set-head">
        <h4>{c.settings.questions}</h4>
        <span className="an-count">{c.settings.count(list.length, max)}</span>
      </div>
      <p className="an-help">{c.settings.questionHelp}</p>
      <ul className="an-ql">
        {list.map((q) => (
          <li key={q.key} className={q.active ? '' : 'off'}>
            {edit === q.key ? (
              <input className="an-in" autoFocus value={q.text} maxLength={200} aria-label={c.settings.edit} onChange={(e) => set(q.key, { text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && setEdit(null)} onBlur={() => setEdit(null)} />
            ) : (
              <span className="t">{q.text}</span>
            )}
            {!q.active && <em>{c.off}</em>}
            {!viewer && ask === q.key ? (
              <span className="confirm">
                <small>{c.settings.removeConfirm}</small>
                <button type="button" className="an-btn small" onClick={() => { onList(list.filter((x) => x.key !== q.key)); setAsk(null) }}>
                  {c.settings.removeYes}
                </button>
                <button type="button" className="an-btn small quiet" onClick={() => setAsk(null)}>
                  {c.settings.removeNo}
                </button>
              </span>
            ) : (
              !viewer && (
                <span className="acts">
                  <button type="button" className="an-btn small quiet" onClick={() => set(q.key, { active: !q.active })}>
                    {q.active ? c.settings.turnOff : c.settings.turnOn}
                  </button>
                  <button type="button" className="an-ico" aria-label={c.settings.edit} onClick={() => setEdit(q.key)}>
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button type="button" className="an-ico" aria-label={c.settings.remove} onClick={() => (q.id === undefined ? onList(list.filter((x) => x.key !== q.key)) : setAsk(q.key))}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </span>
              )
            )}
          </li>
        ))}
      </ul>
      {!viewer && (
        <>
          <div className="an-add">
            <input className="an-in" value={draft} maxLength={200} disabled={full} placeholder={c.settings.addPlaceholder} aria-label={c.settings.add} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(draft)} />
            <button type="button" className="an-btn" disabled={full || draft.trim().length < 8 || own} onClick={() => add(draft)}>
              <Plus size={15} aria-hidden="true" />
              {c.settings.addButton}
            </button>
            <button type="button" className="an-btn" aria-expanded={shown} onClick={() => setShown(!shown)}>
              <Ghost size={15} aria-hidden="true" />
              {c.settings.suggest}
            </button>
          </div>
          {own && <p className="an-warn">{c.settings.ownName}</p>}
          {full && <p className="an-help">{c.settings.max(max)}</p>}
          {shown && (
            <div className="an-sug">
              <small>{left.length ? c.settings.suggested : c.settings.noSuggestions}</small>
              {left.map((s) => (
                <button key={s} type="button" className="an-chip" disabled={full} onClick={() => add(s)}>
                  <Plus size={12} aria-hidden="true" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
