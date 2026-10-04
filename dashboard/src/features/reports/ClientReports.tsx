// Settings → Alerts → Client reports: the numbers of a site, by email and
// optionally as a PDF, to the people who pay for them, weekly or monthly, in
// their language. It lives beside the alerts because it goes the same way: by
// the server's mail. Owners only (the page is behind the same lock).
import { FileText, Pencil, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { confirm } from '../../components/Confirm'
import { Switch } from '../../components/Switch'
import { toast } from '../../components/Toast'
import { fail, more, type ReportSchedule, type ReportSchedules, type Site } from '../../lib/apiMore'
import { copy } from './copy'
import { BLANK, ReportForm } from './ReportForm'
import './reports.css'

const nameOf = (s: ReportSchedule) => s.name || copy.untitled

export function ClientReports({ site }: { site: Site }) {
  const [data, setData] = useState<ReportSchedules | null>(null)
  const [editing, setEditing] = useState<ReportSchedule | 'new' | null>(null)
  const [testing, setTesting] = useState('')
  const load = () =>
    more
      .reportSchedules(site.id)
      .then(setData)
      .catch(() => setData({ schedules: [], ready: false, mail: false, langs: ['en'], max_recipients: 10 }))
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is a new function every render; refetch only when the site changes
  }, [site.id])
  if (!data) return <div className="skeleton" style={{ height: 120 }} />

  const toggle = (s: ReportSchedule) =>
    more
      .saveReportSchedule(site.id, { ...s, enabled: !s.enabled })
      .then(() => {
        toast(s.enabled ? copy.turnedOff(nameOf(s)) : copy.on(nameOf(s)))
        return load()
      })
      .catch((e: unknown) => fail(e))
  const remove = async (s: ReportSchedule) => {
    if (!(await confirm({ title: copy.removeTitle(nameOf(s)), body: copy.removeBody, confirmLabel: copy.remove, danger: true }))) return
    more
      .deleteReportSchedule(site.id, s.id)
      .then(() => {
        toast(copy.removed)
        return load()
      })
      .catch((e: unknown) => fail(e))
  }
  const test = (s: ReportSchedule) => {
    setTesting(s.id)
    more
      .testReportSchedule(site.id, s.id)
      .then((r) => toast(copy.testSent(r.sent_to)))
      .catch((e: unknown) => fail(e))
      .finally(() => setTesting(''))
  }
  const done = () => {
    setEditing(null)
    void load()
  }

  return (
    <section className="card rp" aria-label={copy.title}>
      <div className="card-head">
        <span className="icon-tile accent" aria-hidden="true">
          <FileText size={18} strokeWidth={1.75} />
        </span>
        <span className="rp-head">
          <h2>{copy.title}</h2>
          <span className="faint">{data.ready ? copy.subtitle : copy.needsMail}</span>
        </span>
        {editing === null && (
          <button type="button" className="btn" onClick={() => setEditing('new')}>
            {copy.add}
          </button>
        )}
      </div>
      {editing !== null && (
        <ReportForm
          key={editing === 'new' ? 'new' : editing.id}
          site={site.id}
          from={editing === 'new' ? BLANK : editing}
          langs={data.langs}
          max={data.max_recipients}
          onDone={done}
        />
      )}
      {editing === null && data.schedules.length === 0 && <p className="faint rp-none">{copy.none}</p>}
      <ul className="rp-list">
        {data.schedules.map((s) => (
          <li key={s.id} className={s.enabled ? 'rp-row' : 'rp-row off'}>
            <span className="rp-main">
              <b>{nameOf(s)}</b>
              <span className="faint">
                {[copy[s.cadence], copy.langNames[s.lang] ?? s.lang, s.pdf ? copy.pdf : '', s.recipients.length ? copy.to(s.recipients.length) : copy.nobody].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="rp-tools">
              <button type="button" className="btn icon ghost" title={copy.test} aria-label={copy.test + ': ' + nameOf(s)} disabled={testing === s.id || !data.ready} onClick={() => test(s)}>
                <Send size={15} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button type="button" className="btn icon ghost" title={copy.edit} aria-label={copy.edit + ': ' + nameOf(s)} onClick={() => setEditing(s)}>
                <Pencil size={15} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button type="button" className="btn icon ghost" title={copy.remove} aria-label={copy.remove + ': ' + nameOf(s)} onClick={() => void remove(s)}>
                <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <Switch on={s.enabled} label={nameOf(s)} onChange={() => void toggle(s)} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
