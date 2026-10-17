import { useState } from 'react'
import { toast } from '../../components/Toast'
import { fail } from '../../lib/api'
import { mentionsApi, type Rules } from './api'
import { ChipList } from './ChipList'
import { trust } from './trustCopy'

const KINDS = ['topic', 'required', 'excluded', 'blocked'] as const

const sameRules = (a: Rules, b: Rules) => KINDS.every((k) => a[k].length === b[k].length && a[k].every((w, i) => w === b[k][i]))

/** Settings → Mentions: the words and sites that decide what counts. Saved with one button. */
export function RulesEditor({ site, saved, draft, readOnly, onDraft, onSaved }: { site: string; saved: Rules; draft: Rules; readOnly: boolean; onDraft: (r: Rules) => void; onSaved: (r: Rules) => void }) {
  const [busy, setBusy] = useState(false)
  const set = (k: (typeof KINDS)[number]) => (v: string[]) => onDraft({ ...draft, [k]: v })
  const save = () => {
    setBusy(true)
    mentionsApi
      .setRules(site, draft)
      .then((r) => {
        onSaved(r)
        toast(trust.ruleSaved)
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  return (
    <div className="mentions-rules">
      <h4>{trust.rulesTitle}</h4>
      <p className="muted">{trust.rulesIntro}</p>
      <ChipList label={trust.topic} help={trust.topicHelp} values={draft.topic} max={20} readOnly={readOnly} onChange={set('topic')} />
      <ChipList label={trust.required} help={trust.requiredHelp} values={draft.required} max={20} readOnly={readOnly} onChange={set('required')} />
      <ChipList label={trust.excluded} help={trust.excludedHelp} values={draft.excluded} max={20} readOnly={readOnly} onChange={set('excluded')} />
      <ChipList label={trust.blocked} help={trust.blockedHelp} values={draft.blocked} max={20} readOnly={readOnly} onChange={set('blocked')} />
      {!readOnly && (
        <button type="button" className="btn primary" disabled={busy || sameRules(saved, draft)} onClick={save}>
          {trust.saveRules}
        </button>
      )}
    </div>
  )
}
