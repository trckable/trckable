// Settings → Alerts. Four things are worth being told about without opening
// the dashboard, plus one short report a week; everything else is noise. They
// go to a webhook, because every tool already takes one, or to an email
// address once the server has a mail server to use (TRCKABLE_SMTP_URL).
import { useEffect, useState } from 'react'
import { Switch } from '../components/Switch'
import { api, type Alert, type Site } from '../lib/api'
import { Info } from '../components/Info'
import { toast, settle } from '../components/Toast'
import { Row } from '../components/Row'

const KINDS: { id: Alert['kind']; label: string; hint: string; unit?: string; fallback: number }[] = [
  { id: 'stopped', label: 'Tracking stopped', hint: 'Nothing has arrived for a while, and it should have', unit: 'hours', fallback: 6 },
  { id: 'spike', label: 'Busy day', hint: 'Today is far above a normal day', unit: '× normal', fallback: 3 },
  { id: 'customer', label: 'Someone paid', hint: 'A payment arrived since the last message', fallback: 0 },
  { id: 'disk', label: 'Disk filling up', hint: 'Less than this many days of room left', unit: 'days', fallback: 14 },
  { id: 'weekly', label: 'Weekly report', hint: "Monday morning: last week's visitors, sources, pages, goals and revenue", fallback: 0 },
]

// Email addresses are stored as mailto: targets and shown without it.
const shown = (t: string) => t.replace(/^mailto:/, '')
const stored = (t: string) => (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(t.trim()) ? 'mailto:' + t.trim() : t.trim())

export function AlertsSettings({ site }: { site: Site }) {
  const [list, setList] = useState<Alert[] | null>(null)
  const [target, setTarget] = useState('')
  const [mail, setMail] = useState(false)
  const [busy, setBusy] = useState(false)
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
      .then(() => (toast('Saved'), load()))
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

  if (!list) return <div className="skeleton" style={{ height: 240 }} />

  return (
    <>
      <section className="card" style={{ gap: 0 }}>
        <div className="card-head" style={{ paddingBottom: 10 }}>
          <h2>Where to send them</h2>
          <Info text="Any URL that accepts JSON: Slack, Discord, Mattermost, n8n, your own endpoint. trckable refuses addresses that are only reachable from inside your network, so an alert can never be turned into a probe. An email address works too, once the server has TRCKABLE_SMTP_URL set." />
        </div>
        <Row label="Send them to" hint={mail ? 'A webhook URL (Slack, Discord, n8n…) or an email address' : 'A webhook URL, posted as JSON with a text field chat tools read. For email, set TRCKABLE_SMTP_URL on the server'}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              style={{ minWidth: 220 }}
              value={target}
              placeholder={mail ? 'https://hooks.slack.com/… or you@example.com' : 'https://hooks.slack.com/…'}
              onChange={(e) => setTarget(e.target.value)}
              onBlur={saveTarget}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <button
              type="button"
              className="btn"
              disabled={busy || !target.trim()}
              onClick={() => {
                setBusy(true)
                const id = toast('Sending a test…', 'busy')
                api
                  .testAlert(site.id, stored(target))
                  .then(() => settle(id, 'Test delivered — check the other end'))
                  .catch((e: Error) => settle(id, e.message, 'error'))
                  .finally(() => setBusy(false))
              }}
            >
              Test
            </button>
          </div>
        </Row>
      </section>

      <section className="card" style={{ gap: 0 }}>
        <div className="card-head" style={{ paddingBottom: 10 }}>
          <h2>What to tell me about</h2>
        </div>
        {KINDS.map((k) => {
          const a = find(k.id)
          const on = !!a?.enabled
          return (
            <Row key={k.id} label={k.label} hint={k.hint}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {k.unit && (
                  <Threshold
                    value={a?.threshold || k.fallback}
                    label={`${k.label} threshold in ${k.unit}`}
                    onSave={(v) => save(k.id, { threshold: v || k.fallback, enabled: on })}
                  />
                )}
                {k.unit && <span className="faint" style={{ fontSize: 12 }}>{k.unit}</span>}
                <Switch on={on} onChange={() => save(k.id, { enabled: !on })} />
              </div>
            </Row>
          )
        })}
        <span className="faint" style={{ fontSize: 12, paddingTop: 10 }}>
          Checked every ten minutes, and each alert stays quiet for six hours after it fires. The weekly report goes out on Monday from 8:00 in the site's timezone.
        </span>
      </section>
    </>
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
      className="input num"
      style={{ width: 74, height: 34, textAlign: 'right' }}
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
