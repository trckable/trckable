// A plan for a day that has not passed: a few words ("newsletter goes out"),
// kept as a note that is marked planned. Plans already made can be removed.
import { Clock, X } from 'lucide-react'
import { useState } from 'react'
import type { Annotation } from '../../lib/api'
import { fail, more } from '../../lib/apiMore'
import { copy } from './copy'

export function PlanForm({ site, day, plans, onChanged }: { site: string; day: string; plans: Annotation[]; onChanged: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const save = () => {
    const words = text.trim()
    if (!words || busy) return
    setBusy(true)
    more
      .addPlan(site, day, words)
      .then(() => {
        setText('')
        onChanged()
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  const remove = (n: Annotation) =>
    more
      .deleteAnnotation(site, n.id)
      .then(onChanged)
      .catch((e: unknown) => fail(e))
  return (
    <div className="cal-plans">
      {plans.map((n) => (
        <span key={n.id} className="cal-chip plan wide">
          <Clock size={11} strokeWidth={2} aria-hidden="true" />
          {n.text}
          <button type="button" aria-label={copy.planRemove} title={copy.planRemove} onClick={() => remove(n)}>
            <X size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      ))}
      <form
        className="cal-plan-add"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input className="input" value={text} maxLength={140} placeholder={copy.planHint} aria-label={copy.planFor(day)} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn" disabled={busy || !text.trim()}>
          {copy.planSave}
        </button>
      </form>
    </div>
  )
}
