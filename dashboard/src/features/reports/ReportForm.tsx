// The body of the report dialog: who it is for and to whom, then how often, in
// which language and with a PDF or without, and a summary that follows every
// change.
import { useState } from 'react'
import { DialogActions } from '../../components/DialogActions'
import { Switch } from '../../components/Switch'
import { fail, more, type ReportSchedule } from '../../lib/apiMore'
import { copy } from './copy'

export type Draft = Omit<ReportSchedule, 'id' | 'site_id' | 'last_sent'> & { id?: string }

export const BLANK: Draft = { name: '', cadence: 'weekly', lang: 'en', pdf: true, recipients: [], enabled: true }

const lines = (s: string) => [...new Set(s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean))]

export const summaryOf = (d: Draft, n: number) =>
  [copy[d.cadence], copy.langNames[d.lang] ?? d.lang, d.pdf ? copy.pdf : '', n ? copy.to(n) : copy.nobody].filter(Boolean).join(' · ')

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
        onDone(s)
      })
      .catch((e: unknown) => fail(e))
      .finally(() => setBusy(false))
  }
  return (
    <form
      className="rp-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy && count <= max) save()
      }}
    >
      <p className="rp-summary" aria-live="polite">
        <span className="faint">{copy.summary}</span>
        <b>{d.name.trim() || copy.untitled}</b>
        <span>{summaryOf(d, count)}</span>
      </p>
      <fieldset className="rp-sec">
        <legend>{copy.who}</legend>
        <label className="field">
          {copy.name}
          <input className="input" value={d.name} maxLength={60} placeholder={copy.namePlaceholder} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">
          <span className="rp-hint">
            {copy.recipients}
            <span className={count > max ? 'faint over' : 'faint'}>{copy.recipientsHint(max)}</span>
          </span>
          <textarea className="input" rows={4} value={text} spellCheck={false} autoComplete="off" placeholder="client@example.com" onChange={(e) => setText(e.target.value)} />
        </label>
      </fieldset>
      <fieldset className="rp-sec">
        <legend>{copy.how}</legend>
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
      </fieldset>
      <DialogActions
        left={
          <button type="button" className="btn ghost" onClick={() => onDone()}>
            {copy.cancel}
          </button>
        }
      >
        <button type="submit" className="btn primary big" disabled={busy || count > max}>
          {busy && <span className="btn-spin" aria-hidden="true" />}
          {copy.save}
        </button>
      </DialogActions>
    </form>
  )
}
