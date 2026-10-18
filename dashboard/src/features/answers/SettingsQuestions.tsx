// Settings → Answers, the questions: add with Enter, edit, turn off, remove, or take a suggestion. Saved with one button.
import { Ghost, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { answersCopy as c } from './copy'
import type { AnswersSettingsData } from './api'

export interface Q {
  id: number
  text: string
  active: boolean
}

export function SettingsQuestions({ data, list, onList, ownName, viewer }: { data: AnswersSettingsData; list: Q[]; onList: (l: Q[]) => void; ownName: string; viewer: boolean }) {
  const [draft, setDraft] = useState('')
  const [edit, setEdit] = useState<number | null>(null)
  const [ask, setAsk] = useState<number | null>(null)
  const [shown, setShown] = useState(false)
  const full = list.length >= data.max
  const names = draft.toLowerCase().includes(ownName)
  const add = (text: string) => {
    const t = text.trim()
    if (t.length < 8 || full || t.toLowerCase().includes(ownName)) return
    onList([...list, { id: Date.now() + list.length, text: t, active: true }])
    setDraft('')
  }
  const set = (id: number, p: Partial<Q>) => onList(list.map((q) => (q.id === id ? { ...q, ...p } : q)))
  const left = data.suggestions.filter((s) => !list.some((q) => q.text === s))
  return (
    <div className="an-set">
      <div className="an-set-head">
        <h4>{c.settings.questions}</h4>
        <span className="an-count">{c.settings.count(list.length, data.max)}</span>
      </div>
      <p className="an-help">{c.settings.questionHelp}</p>
      <ul className="an-ql">
        {list.map((q) => (
          <li key={q.id} className={q.active ? '' : 'off'}>
            {edit === q.id ? (
              <input className="an-in" autoFocus value={q.text} maxLength={200} aria-label={c.settings.edit} onChange={(e) => set(q.id, { text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && setEdit(null)} onBlur={() => setEdit(null)} />
            ) : (
              <span className="t">{q.text}</span>
            )}
            {!q.active && <em>{c.settings.off}</em>}
            {!viewer && ask === q.id ? (
              <span className="confirm">
                <small>{c.settings.removeConfirm}</small>
                <button type="button" className="an-btn small" onClick={() => { onList(list.filter((x) => x.id !== q.id)); setAsk(null) }}>
                  {c.settings.removeYes}
                </button>
                <button type="button" className="an-btn small quiet" onClick={() => setAsk(null)}>
                  {c.settings.removeNo}
                </button>
              </span>
            ) : (
              !viewer && (
                <span className="acts">
                  <button type="button" className="an-btn small quiet" onClick={() => set(q.id, { active: !q.active })}>
                    {q.active ? c.settings.turnOff : c.settings.turnOn}
                  </button>
                  <button type="button" className="an-ico" aria-label={c.settings.edit} onClick={() => setEdit(q.id)}>
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button type="button" className="an-ico" aria-label={c.settings.remove} onClick={() => setAsk(q.id)}>
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
            <button type="button" className="an-btn" disabled={full || draft.trim().length < 8 || names} onClick={() => add(draft)}>
              <Plus size={15} aria-hidden="true" />
              {c.settings.addButton}
            </button>
            <button type="button" className="an-btn" onClick={() => setShown(!shown)}>
              <Ghost size={15} aria-hidden="true" />
              {c.settings.suggest}
            </button>
          </div>
          {names && <p className="an-warn">{c.settings.ownName}</p>}
          {full && <p className="an-help">{c.settings.max(data.max)}</p>}
          {shown && (
            <div className="an-sug">
              <small>{c.settings.suggested}</small>
              {left.map((s) => (
                <button key={s} type="button" className="an-chip" disabled={full} onClick={() => add(s)}>
                  <Plus size={12} aria-hidden="true" />
                  {s}
                </button>
              ))}
              {left.length === 0 && <X size={0} aria-hidden="true" />}
            </div>
          )}
        </>
      )}
    </div>
  )
}
