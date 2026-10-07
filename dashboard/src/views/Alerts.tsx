// Settings → Alerts. Four things are worth being told about without opening
// the dashboard, plus one short report a week; everything else is noise. They
// go to a webhook, because every tool already takes one, or to an email
// address once the server has a mail server to use (TRCKABLE_SMTP_URL).
import { Banknote, Bell, CalendarDays, HardDrive, Send, TrendingUp, TriangleAlert, Trophy, WifiOff, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import './Alerts.css'
import { Switch } from '../components/Switch'
import { fail, type Alert, type Site, more } from '../lib/apiMore'
import { words } from '../lib/errors'
import { toast } from '../components/Toast'
import { EmptyState } from '../components/EmptyState'
import { WeeklyNow } from './WeeklyNow'
import { advice, ago, kindOf, SEND_LABEL, SendIcon, shown, stored, whereOf } from './alertsParts'

const DAYS = ['Sunday', 'Monday']

// Each alert, as the sentence it is. The threshold sits inside the sentence.
const KINDS: { id: Alert['kind']; label: string; Icon: typeof Bell; before?: string; unit?: string; fallback: number; hint: (site: Site) => string }[] = [
  { id: 'stopped', label: 'Tracking stopped', Icon: WifiOff, before: 'No visits for', unit: 'hours', fallback: 6, hint: () => 'when it normally has some by then' },
  { id: 'spike', label: 'Busy day', Icon: TrendingUp, before: 'Today reaches', unit: '× a normal day', fallback: 3, hint: () => 'and at least 50 visitors' },
  { id: 'surge', label: 'Traffic surge', Icon: Zap, fallback: 0, hint: () => 'Busier than usual right now (at least one and a half times, and 10 more people): who sent them, at most once every three hours' },
  { id: 'customer', label: 'Someone paid', Icon: Banknote, fallback: 0, hint: () => 'New payments since the last message, at most once every six hours' },
  { id: 'disk', label: 'Disk filling up', Icon: HardDrive, before: 'Less than', unit: 'days of room left', fallback: 14, hint: () => 'at the rate the last week wrote' },
  { id: 'weekly', label: 'Weekly report', Icon: CalendarDays, fallback: 0, hint: (site) => `${DAYS[site.week_start === 0 ? 0 : 1]} from 8:00: last week's visitors, sources, pages, goals and revenue, then what changed` },
  { id: 'milestone', label: 'Milestone reached', Icon: Trophy, fallback: 0, hint: () => 'A round number, the day after it is reached; money without the amount' },
]

export function AlertsSettings({ site }: { site: Site }) {
  const [list, setList] = useState<Alert[] | null>(null)
  const [target, setTarget] = useState('')
  const [mail, setMail] = useState(false)
  const [test, setTest] = useState<{ state: 'busy' | 'ok' | 'bad'; text: string } | null>(null)
  const load = () =>
    more
      .alerts(site.id)
      .then((r) => {
        setList(r.alerts)
        setMail(!!r.mail)
        if (r.alerts[0]) setTarget(shown(r.alerts[0].target))
      })
      .catch(() => setList([]))
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is a new function every render; refetch only when the site changes
  }, [site.id])

  const find = (kind: Alert['kind']) => list?.find((a) => a.kind === kind)

  const save = (kind: Alert['kind'], patch: Partial<Alert>, to = target) => {
    const current = find(kind)
    const next = { id: current?.id, kind, enabled: current?.enabled ?? true, target: stored(to), threshold: current?.threshold ?? 0, ...patch }
    if (!next.target) {
      toast(mail ? 'Add a webhook URL or an email address first' : 'Add a webhook URL first', 'error')
      return
    }
    return more
      .saveAlert(site.id, next)
      .then(() => {
        const label = KINDS.find((k) => k.id === kind)?.label ?? kind
        toast(next.enabled ? `${label}: on` : `${label}: off`)
        return load()
      })
      .catch((e: unknown) => fail(e))
  }

  // Changing where alerts go has to move the ones already set up, or the URL
  // would sit there looking saved while alerts kept going somewhere else.
  const saveTarget = () => {
    const to = stored(target)
    const set = (list ?? []).filter((a) => a.target !== to)
    if (!to || set.length === 0) return
    Promise.all(set.map((a) => more.saveAlert(site.id, { ...a, target: to })))
      .then(() => {
        toast(`Alerts now go to ${to.startsWith('mailto:') ? shown(to) : new URL(to).host}`)
        return load()
      })
      .catch((e: unknown) => fail(e))
  }

  // Long enough to see it leave, even when the answer is instant.
  const sendTest = () => {
    setTest({ state: 'busy', text: 'Sending a test…' })
    const seen = new Promise((r) => setTimeout(r, 900))
    more
      .testAlert(site.id, stored(target))
      .then(async () => {
        await seen
        setTest({ state: 'ok', text: `Delivered at ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}. Check the other end: a message saying it is a test.` })
      })
      .catch(async (e: unknown) => {
        await seen
        setTest({ state: 'bad', text: words(e) })
      })
  }
  if (!list) return <div className="skeleton" style={{ height: 240 }} />
  const on = list.filter((a) => a.enabled).length
  const dest = kindOf(target)
  const where = whereOf(target)
  let summary = 'Tell trckable where to send them, then pick what matters'
  if (on) summary = `${on} of ${KINDS.length} on · sent to ${where}`
  else if (where) summary = 'None on yet: pick what to be told about below'

  // Under the address: how the last test went, or what can go there.
  const status = () => {
    if (test?.state === 'ok')
      return (
        <span className="al-test ok" role="status">
          {test.text}
        </span>
      )
    if (test?.state === 'bad')
      return (
        <div className="al-fail" role="alert">
          <TriangleAlert size={16} strokeWidth={1.9} aria-hidden="true" />
          <span>
            <b>The test was not delivered</b>
            <span>{test.text}.</span>
            <span className="faint">{advice(test.text)}</span>
          </span>
        </div>
      )
    if (test?.state === 'busy')
      return (
        <span className="al-test busy" role="status">
          Sending a test to {where}…
        </span>
      )
    return (
      <span className="faint al-note">
        {mail ? 'Slack, Discord, Mattermost, n8n or any URL that takes JSON, or an email address.' : 'Slack, Discord, Mattermost, n8n or any URL that takes JSON. Email works once the server has TRCKABLE_SMTP_URL.'}{' '}
        Addresses inside your own network are refused, so an alert can never probe it.
      </span>
    )
  }

  return (
    <section className="al">
      <div className="al-head">
        <span className="icon-tile accent" aria-hidden="true">
          <Bell size={18} strokeWidth={1.75} />
        </span>
        <span className="al-head-text">
          <h2>Alerts</h2>
          <span className="faint">{summary}</span>
        </span>
      </div>

      <div className="card al-dest">
        <div className="al-dest-row">
          <label className="al-field">
            <span className="al-field-kind" aria-hidden="true">
              {dest ? <dest.Icon size={16} strokeWidth={1.75} /> : <Send size={16} strokeWidth={1.75} />}
            </span>
            <input
              value={target}
              placeholder={mail ? 'https://hooks.slack.com/… or you@example.com' : 'https://hooks.slack.com/…'}
              aria-label="Where to send alerts"
              spellCheck={false}
              onChange={(e) => {
                setTarget(e.target.value)
                setTest(null)
              }}
              onBlur={saveTarget}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            {dest && <span className="al-chip">{dest.name}</span>}
          </label>
          <button
            type="button"
            key={test?.state ?? 'idle'}
            className={'btn al-send' + (test ? ' ' + test.state : '')}
            disabled={test?.state === 'busy' || !target.trim()}
            onClick={sendTest}
            aria-live="polite"
          >
            <span className="al-send-icon" aria-hidden="true">
              <SendIcon state={test?.state} />
            </span>
            {SEND_LABEL[test?.state ?? 'idle']}
          </button>
        </div>
        {status()}
      </div>

      {!target.trim() && !list.length && <EmptyState line="Alerts tell you when something needs you." action="Add where to send them" onAction={() => document.querySelector<HTMLInputElement>('.al-field input')?.focus()} />}
      <div className={'al-kinds' + (target.trim() ? '' : ' waiting')}>
        {KINDS.map((k) => {
          const a = find(k.id)
          const isOn = !!a?.enabled
          return (
            <div key={k.id} className={'al-kind' + (isOn ? ' on' : '')}>
              <span className={'icon-tile' + (isOn ? ' accent' : '')} aria-hidden="true">
                <k.Icon size={17} strokeWidth={1.75} />
              </span>
              <span className="al-kind-text">
                <b>{k.label}</b>
                <span className="al-rule">
                  {k.unit ? (
                    <>
                      {k.before}{' '}
                      <Threshold value={a?.threshold || k.fallback} label={`${k.label} threshold in ${k.unit}`} onSave={(v) => save(k.id, { threshold: v || k.fallback, enabled: isOn })} />{' '}
                      {k.unit}, {k.hint(site)}
                    </>
                  ) : (
                    k.hint(site)
                  )}
                </span>
                {a?.last_fired ? <span className="faint al-last">Last sent {ago(a.last_fired)}</span> : null}
                {k.id === 'weekly' && mail && <WeeklyNow site={site.id} />}
              </span>
              <Switch on={isOn} label={k.label} disabled={!target.trim()} onChange={() => save(k.id, { enabled: !isOn })} />
            </div>
          )
        })}
      </div>
      <span className="faint al-foot">Checked every ten minutes. After an alert is sent, the same one stays quiet for six hours.</span>
    </section>
  )
}

/** A number that saves when you finish typing it, not on every keystroke:
 *  typing "30" used to save 3 first, and say so twice. */
function Threshold({ value, label, onSave }: { value: number; label: string; onSave: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  // A new value from outside shows unless it is being typed over.
  const [seen, setSeen] = useState({ value, editing })
  if (seen.value !== value || seen.editing !== editing) {
    setSeen({ value, editing })
    if (!editing) setText(String(value))
  }
  return (
    <input
      className="input num al-num"
      value={text}
      inputMode="numeric"
      aria-label={label}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false)
        const v = Number(text)
        if (Number.isFinite(v) && v !== value) onSave(v)
        else setText(String(value))
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
