// Settings → Health. "Is this thing still fine?", answered without reading a
// log: events flowing, how far behind the writer is, what the disk holds and
// how long that lasts, and whether payments are arriving.
import { useEffect, useState } from 'react'
import { api, type Health as H } from '../lib/api'
import { fmtInt } from '../lib/format'
import { Row } from '../components/Row'

const bytes = (n: number) => {
  if (n <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

const since = (unix?: number) => {
  if (!unix) return 'never'
  const s = Math.max(0, Date.now() / 1000 - unix)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}

const uptime = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : s < 172800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} days`)

export function HealthSettings() {
  const [h, setH] = useState<H | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const load = () =>
      api
        .health()
        .then(setH)
        .catch((e: Error) => setErr(e.message))
    load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [])

  if (err) return <div className="banner">{err}</div>
  if (!h) return <div className="skeleton" style={{ height: 260 }} />

  const state = h.analytics === 'ready' ? { tone: 'var(--up)', text: 'Everything is running' } : h.analytics === 'warming' ? { tone: 'var(--money)', text: 'Analytics store warming up' } : { tone: 'var(--down)', text: 'The analytics store reported a problem' }

  return (
    <>
      <section className="card" style={{ gap: 0 }}>
        <div className="card-head" style={{ paddingBottom: 10 }}>
          <h2>Health</h2>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
            <span className="dot" style={{ background: state.tone, borderRadius: '50%' }} />
            {state.text}
          </span>
        </div>
        <Row label="Version" hint={`Up for ${uptime(h.uptime_s)}`}>
          <span className="num">{h.version}</span>
        </Row>
        <Row label="Events accepted" hint={`${fmtInt(h.events.bots)} bots and ${fmtInt(h.events.rejected)} rejected since boot`}>
          <span className="num">{fmtInt(h.events.accepted)}</span>
        </Row>
        <Row label="Writer" hint={h.events.lag > 0 ? 'Records durable in the log, not yet in the analytics store' : 'Everything durable has been applied'}>
          <span className="num" style={h.events.lag > 5000 ? { color: 'var(--money)' } : undefined}>
            {h.events.lag > 0 ? `${fmtInt(h.events.lag)} behind` : 'up to date'}
          </span>
        </Row>
        <Row label="Memory" hint="Resident set as Go reports it">
          <span className="num">{bytes(h.memory_bytes)}</span>
        </Row>
      </section>

      <section className="card" style={{ gap: 0 }}>
        <div className="card-head" style={{ paddingBottom: 10 }}>
          <h2>Disk</h2>
        </div>
        <Row label="Stored" hint={`${fmtInt(h.store.events)} events · ${h.store.bytes_per_event ? h.store.bytes_per_event.toFixed(0) + ' B each' : '—'}`}>
          <span className="num">{bytes(h.store.bytes_used)}</span>
        </Row>
        <Row label="Free" hint={h.store.days_left > 0 ? `About ${Math.round(h.store.days_left)} days at the current rate` : 'The rate is still being measured'}>
          <span className="num">{bytes(h.store.bytes_free)}</span>
        </Row>
        <Row
          label="Last backup"
          hint={h.backup.at ? `${bytes(h.backup.bytes)} · encrypted with this instance's key · ${h.backup.offsite ? 'two kept here, the rest off-site' : 'seven kept'}` : 'One is written a few minutes after boot, then daily'}
        >
          <span className="num" style={!h.backup.at ? { color: 'var(--money)' } : undefined}>
            {since(h.backup.at)}
          </span>
        </Row>
        <Row
          label="Off-site copy"
          hint={
            h.backup.offsite_error
              ? `The last copy failed: ${h.backup.offsite_error}`
              : h.backup.offsite
                ? `${h.backup.offsite} · kept ${h.backup.offsite_days} days`
                : 'Only on this machine. Set TRCKABLE_BACKUP_S3 to copy each backup to a bucket elsewhere'
          }
        >
          <span className="num" style={h.backup.offsite_error || !h.backup.offsite ? { color: 'var(--money)' } : undefined}>
            {h.backup.offsite ? (h.backup.offsite_at ? since(h.backup.offsite_at) : 'Not yet') : 'Off'}
          </span>
        </Row>
      </section>

      {h.payments && (
        <section className="card" style={{ gap: 0 }}>
          <div className="card-head" style={{ paddingBottom: 10 }}>
            <h2>Payments</h2>
          </div>
          <Row label="Providers connected">
            <span className="num">{h.payments.connections}</span>
          </Row>
          <Row label="Last webhook" hint={h.payments.pending > 0 ? `${h.payments.pending} waiting to be processed` : 'Nothing waiting'}>
            <span className="num">{since(h.payments.last_event)}</span>
          </Row>
          <Row label="Last reconciliation" hint="trckable checks each provider every six hours">
            <span className="num">{since(h.payments.last_sync)}</span>
          </Row>
        </section>
      )}
    </>
  )
}
