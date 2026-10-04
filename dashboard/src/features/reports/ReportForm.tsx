// One schedule, added or changed in the card itself (no dialog): who it is
// for, how often, in which language, with a PDF or without, and to whom.
import { useState } from 'react'
import { Switch } from '../../components/Switch'
import { fail, more, type ReportSchedule } from '../../lib/apiMore'
import { toast } from '../../components/Toast'
import { copy } from './copy'

type Draft = Omit<ReportSchedule, 'id' | 'site_id' | 'last_sent'> & { id?: string }

export const BLANK: Draft = { name: '', cadence: 'weekly', lang: 'en', pdf: true, recipients: [], enabled: true }

const lines = (s: string) => s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)

export function ReportForm({ site, from, langs, max, onDone }: { site: string; from: Draft; langs: string[]; max: number; onDone: (saved?: ReportSchedule) => void }) {
  const [d, setD] = useState(from)
  const [text, setText] = useState(from.recipients.join('\n'))
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
  const count = lines(text).length
  const save = () => {
    setBusy(true)
    more
      .saveReportSchedule(site, { ...d, recipients: lines(text) })
      .then((s) => {
        toast(copy.saved)
        onDone(s)
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  return (
    <div className="rp-form">
      <label className="field">
        {copy.name}
        <input className="input" value={d.name} maxLength={60} placeholder={copy.namePlaceholder} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="rp-two">
        <div className="field" role="group" aria-label={copy.cadence}>
          <span>{copy.cadence}</span>
          <div className="rp-seg">
            {(['weekly', 'monthly'] as const).map((c) => (
              <button key={c} type="button" className={d.cadence === c ? 'btn on' : 'btn'} aria-pressed={d.cadence === c} onClick={() => set({ cadence: c })}>
                {copy[c]}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          {copy.language}
          <select className="input" value={d.lang} onChange={(e) => set({ lang: e.target.value })}>
            {langs.map((l) => (
              <option key={l} value={l}>
                {copy.langNames[l] ?? l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="rp-toggle">
        <span>{copy.attachPdf}</span>
        <Switch on={d.pdf} label={copy.attachPdf} onChange={() => set({ pdf: !d.pdf })} />
      </label>
      <label className="field">
        <span className="rp-hint">
          {copy.recipients}
          <span className={count > max ? 'faint over' : 'faint'}>{copy.recipientsHint(max)}</span>
        </span>
        <textarea className="input" rows={3} value={text} spellCheck={false} autoComplete="off" placeholder="client@example.com" onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="rp-actions">
        <button type="button" className="btn primary" disabled={busy || count > max} onClick={save}>
          {busy && <span className="btn-spin" aria-hidden="true" />}
          {copy.save}
        </button>
        <button type="button" className="btn ghost" onClick={() => onDone()}>
          {copy.cancel}
        </button>
      </div>
    </div>
  )
}
