// Settings → Alerts. Four things are worth being told about without opening
// the dashboard, plus one short report a week; everything else is noise. They
// go to a webhook, because every tool already takes one, or to an email
// address once the server has a mail server to use (TRCKABLE_SMTP_URL).
import { Banknote, Bell, CalendarDays, Check, HardDrive, Mail, MessageSquare, Send, TrendingUp, TriangleAlert, Webhook, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import './Alerts.css'
import { Switch } from '../components/Switch'
import { api, type Alert, type Site } from '../lib/api'
import { toast } from '../components/Toast'

const DAYS = ['Sunday', 'Monday']

// Each alert, as the sentence it is. The threshold sits inside the sentence.
const KINDS: { id: Alert['kind']; label: string; Icon: typeof Bell; before?: string; unit?: string; fallback: number; hint: (site: Site) => string }[] = [
  { id: 'stopped', label: 'Tracking stopped', Icon: WifiOff, before: 'No visits for', unit: 'hours', fallback: 6, hint: () => 'when it normally has some by then' },
  { id: 'spike', label: 'Busy day', Icon: TrendingUp, before: 'Today reaches', unit: '× a normal day', fallback: 3, hint: () => 'and at least 50 visitors' },
  { id: 'customer', label: 'Someone paid', Icon: Banknote, fallback: 0, hint: () => 'New payments since the last message, at most once every six hours' },
  { id: 'disk', label: 'Disk filling up', Icon: HardDrive, before: 'Less than', unit: 'days of room left', fallback: 14, hint: () => 'at the rate the last week wrote' },
  {
    id: 'weekly',
    label: 'Weekly report',
    Icon: CalendarDays,
    fallback: 0,
    hint: (site) => `${DAYS[site.week_start === 0 ? 0 : 1]} from 8:00: last week's visitors, sources, pages, goals and revenue`,
  },
]

// Email addresses are stored as mailto: targets and shown without it.
const shown = (t: string) => t.replace(/^mailto:/, '')
const stored = (t: string) => (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(t.trim()) ? 'mailto:' + t.trim() : t.trim())

// What the destination is, from its address.
function kindOf(t: string): { name: string; Icon: typeof Bell } | null {
  const v = t.trim()
  if (!v) return null
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(v) || v.startsWith('mailto:')) return { name: 'Email', Icon: Mail }
  if (/hooks\.slack\.com/.test(v)) return { name: 'Slack', Icon: MessageSquare }
  if (/discord(app)?\.com\/api\/webhooks/.test(v)) return { name: 'Discord', Icon: MessageSquare }
  if (/^https?:\/\//.test(v)) return { name: 'Webhook', Icon: Webhook }
  return null
}

function ago(unix: number): string {
  const s = Math.max(0, Date.now() / 1000 - unix)
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}

export function AlertsSettings({ site }: { site: Site }) {
  const [list, setList] = useState<Alert[] | null>(null)
  const [target, setTarget] = useState('')
  const [mail, setMail] = useState(false)
  const [test, setTest] = useState<{ state: 'busy' | 'ok' | 'bad'; text: string } | null>(null)
  const load = () =>
    api
      .alerts(site.id)
      .then((r) => {
        setList(r.alerts)
        setMail(!!r.mail)
        if (r.alerts[0]) setTarget(shown(r.alerts[0].target))
      })
      .catch(() => setList([]))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id])

  const find = (kind: Alert['kind']) => list?.find((a) => a.kind === kind)

  const save = (kind: Alert['kind'], patch: Partial<Alert>, to = target) => {
    const current = find(kind)
    const next = { id: current?.id, kind, enabled: current?.enabled ?? true, target: stored(to), threshold: current?.threshold ?? 0, ...patch }
    if (!next.target) {
      toast(mail ? 'Add a webhook URL or an email address first' : 'Add a webhook URL first', 'error')
      return
    }
    return api
      .saveAlert(site.id, next)
      .then(() => (toast(next.enabled ? `${KINDS.find((k) => k.id === kind)!.label}: on` : `${KINDS.find((k) => k.id === kind)!.label}: off`), load()))
      .catch((e: Error) => toast(e.message, 'error'))
  }

  // Changing where alerts go has to move the ones already set up, or the URL
  // would sit there looking saved while alerts kept going somewhere else.
  const saveTarget = () => {
    const to = stored(target)
    const set = (list ?? []).filter((a) => a.target !== to)
    if (!to || set.length === 0) return
    Promise.all(set.map((a) => api.saveAlert(site.id, { ...a, target: to })))
      .then(() => (toast(`Alerts now go to ${to.startsWith('mailto:') ? shown(to) : new URL(to).host}`), load()))
      .catch((e: Error) => toast(e.message, 'error'))
  }

  // Long enough to see it leave, even when the answer is instant.
  const sendTest = () => {
    setTest({ state: 'busy', text: 'Sending a test…' })
    const seen = new Promise((r) => setTimeout(r, 900))
    api
      .testAlert(site.id, stored(target))
      .then(async () => {
        await seen
        setTest({ state: 'ok', text: `Delivered at ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}. Check the other end: a message saying it is a test.` })
      })
      .catch(async (e: Error) => {
        await seen
        setTest({ state: 'bad', text: e.message.charAt(0).toUpperCase() + e.message.slice(1) })
      })
  }
  // What to do about a failed test, in words.
  const advice = (why: string) =>
    /not reachable from outside|private|internal/i.test(why)
      ? 'Use a public https address: trckable never calls addresses inside your own network.'
      : /email is not set up|SMTP/i.test(why)
        ? 'Set TRCKABLE_SMTP_URL on the server, or send them to a webhook instead.'
        : /40[0-9]|invalid|not found/i.test(why)
          ? 'The other end refused it: check the webhook URL is complete and still active.'
          : /timeout|deadline|refused|no such host/i.test(why)
            ? 'The other end did not answer: check the address, or try again in a moment.'
            : 'Check the address and try again.'


  if (!list) return <div className="skeleton" style={{ height: 240 }} />
  const on = list.filter((a) => a.enabled).length
  const dest = kindOf(target)
  const where = target.trim() ? (target.includes('@') && !target.startsWith('http') ? shown(target) : (() => { try { return new URL(stored(target)).host } catch { return target } })()) : ''

  return (
    <section className="al">
      <div className="al-head">
        <span className="icon-tile accent" aria-hidden="true">
          <Bell size={18} strokeWidth={1.75} />
        </span>
        <span className="al-head-text">
          <h2>Alerts</h2>
          <span className="faint">{on ? `${on} of ${KINDS.length} on · sent to ${where}` : where ? 'None on yet: pick what to be told about below' : 'Tell trckable where to send them, then pick what matters'}</span>
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
              onChange={(e) => (setTarget(e.target.value), setTest(null))}
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
              {test?.state === 'ok' ? <Check size={15} strokeWidth={2.4} /> : test?.state === 'bad' ? <TriangleAlert size={15} strokeWidth={2} /> : <Send size={15} strokeWidth={1.75} />}
            </span>
            {test?.state === 'busy' ? 'Sending…' : test?.state === 'ok' ? 'Delivered' : test?.state === 'bad' ? 'Try again' : 'Send a test'}
          </button>
        </div>
        {test?.state === 'ok' ? (
          <span className="al-test ok" role="status">
            {test.text}
          </span>
        ) : test?.state === 'bad' ? (
          <div className="al-fail" role="alert">
            <TriangleAlert size={16} strokeWidth={1.9} aria-hidden="true" />
            <span>
              <b>The test was not delivered</b>
              <span>{test.text}.</span>
              <span className="faint">{advice(test.text)}</span>
            </span>
          </div>
        ) : test?.state === 'busy' ? (
          <span className="al-test busy" role="status">
            Sending a test to {where}…
          </span>
        ) : (
          <span className="faint al-note">
            {mail ? 'Slack, Discord, Mattermost, n8n or any URL that takes JSON, or an email address.' : 'Slack, Discord, Mattermost, n8n or any URL that takes JSON. Email works once the server has TRCKABLE_SMTP_URL.'}{' '}
            Addresses inside your own network are refused, so an alert can never probe it.
          </span>
        )}
      </div>

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
  useEffect(() => {
    if (!editing) setText(String(value))
  }, [value, editing])
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
