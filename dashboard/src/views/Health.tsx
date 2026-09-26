// Settings → Health. "Is this thing still fine?", answered without reading a
// log: events flowing, how far behind the writer is, what the disk holds and
// how long that lasts, whether backups are being made, and whether payments
// are arriving. Only the operator of a self-hosted instance sees it.
import { Activity, ArchiveRestore, CircleCheck, CloudUpload, Cpu, CreditCard, HardDrive, Inbox, RefreshCcw, TriangleAlert, Webhook } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type Health as H } from '../lib/api'
import { fmtInt } from '../lib/format'
import './Health.css'

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

const fmtDays = (d: number) => (d > 3650 ? "more than ten years" : d > 730 ? `${Math.round(d / 365)} years` : d > 120 ? `${Math.round(d / 30)} months` : `${Math.round(d)} days`)

const uptime = (s: number) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 172800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} days`)

type Tone = 'ok' | 'warn' | 'bad' | 'info'

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={'hpill ' + tone}>{children}</span>
}

function Tile({ icon: Icon, label, value, sub, tone }: { icon: typeof Cpu; label: string; value: string; sub: string; tone?: Tone }) {
  return (
    <div className={'htile' + (tone && tone !== 'ok' ? ' ' + tone : '')}>
      <span className="htile-head">
        <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
        {label}
      </span>
      <b className="num">{value}</b>
      <span className="faint">{sub}</span>
    </div>
  )
}

function Item({ icon: Icon, label, hint, children }: { icon: typeof Cpu; label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="hitem">
      <span className="icon-tile" aria-hidden="true">
        <Icon size={17} strokeWidth={1.75} />
      </span>
      <span className="hitem-text">
        <b>{label}</b>
        <span className="faint">{hint}</span>
      </span>
      {children}
    </div>
  )
}

export function HealthSettings() {
  const [h, setH] = useState<H | null>(null)
  const [at, setAt] = useState<Date | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const load = () =>
      api
        .health()
        .then((r) => (setH(r), setAt(new Date()), setErr(null)))
        .catch((e: Error) => setErr(e.message))
    load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [])

  if (err && !h) return <div className="banner">{err}</div>
  if (!h) return <div className="skeleton" style={{ height: 320 }} />

  const lagTone: Tone = h.events.lag > 5000 ? 'warn' : 'ok'
  const backupTone: Tone = h.backup.error ? 'bad' : !h.backup.at ? 'warn' : Date.now() / 1000 - h.backup.at > 2 * 86400 ? 'bad' : 'ok'
  const offTone: Tone = h.backup.offsite_error ? 'bad' : h.backup.offsite ? 'ok' : 'warn'
  const diskTone: Tone = !(h.store.days_left > 0) ? 'info' : h.store.days_left < 14 ? 'bad' : h.store.days_left < 60 ? 'warn' : 'ok'
  // What needs a look, in words, so the top line can say it.
  const issues = [
    h.ingest_error && { tone: 'bad', text: 'new visits are being turned away' },
    h.analytics === 'error' && { tone: 'bad', text: 'the analytics store reported a problem' },
    h.backup.error && { tone: 'bad', text: 'the last backup failed' },
    !h.backup.error && backupTone === 'bad' && { tone: 'bad', text: 'no backup for over two days' },
    !h.backup.at && { tone: 'warn', text: 'no backup yet' },
    diskTone === 'bad' && { tone: 'bad', text: 'the disk is nearly full' },
    diskTone === 'warn' && { tone: 'warn', text: 'the disk fills within two months' },
    h.backup.offsite_error && { tone: 'bad', text: 'the last off-site copy failed' },
    !h.backup.offsite && { tone: 'warn', text: 'backups stay on this machine only' },
    lagTone === 'warn' && { tone: 'warn', text: 'the writer is behind' },
    h.key_on_volume && { tone: 'warn', text: 'the instance key is only on this disk' },
  ].filter(Boolean) as { tone: Tone; text: string }[]
  const state: { tone: Tone; title: string; sub?: string } =
    h.analytics === 'warming'
      ? { tone: 'warn', title: 'Warming up the analytics store' }
      : issues.length === 0
        ? { tone: 'ok', title: 'Everything is running' }
        : {
            tone: issues.some((i) => i.tone === 'bad') ? 'bad' : 'warn',
            title: issues.length === 1 ? 'Running, with one thing to look at' : `Running, with ${issues.length} things to look at`,
            sub: issues.map((i) => i.text).join(' · ').replace(/^./, (c) => c.toUpperCase()),
          }

  return (
    <>
      <section className={'health-hero ' + state.tone}>
        <span className="health-orb" aria-hidden="true">
          {state.tone === 'ok' ? <CircleCheck size={22} strokeWidth={1.75} /> : <TriangleAlert size={22} strokeWidth={1.75} />}
        </span>
        <span className="health-hero-text">
          <b>{state.title}</b>
          {state.sub && <span className="health-issue">{state.sub}</span>}
          <span className="faint">
            trckable <span className="num">{h.version}</span> · up for {uptime(h.uptime_s)}
          </span>
        </span>
        <span className="health-live faint" title="Refreshed every 15 seconds">
          <span className="health-live-dot" aria-hidden="true" />
          {err ? 'Could not refresh' : `Live · ${at?.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
        </span>
      </section>

      <div className="htiles">
        <Tile icon={Activity} label="Events since boot" value={fmtInt(h.events.accepted)} sub={`${fmtInt(h.events.bots)} bots · ${fmtInt(h.events.rejected)} rejected`} />
        <Tile
          icon={Inbox}
          label="Writer"
          value={h.events.lag > 0 ? `${fmtInt(h.events.lag)} behind` : 'Up to date'}
          sub={h.events.lag > 0 ? 'Safe in the log, not yet in reports' : 'Everything saved is in reports'}
          tone={lagTone}
        />
        <Tile
          icon={Cpu}
          label="Memory"
          value={bytes(h.memory_bytes)}
          sub={h.memory_source === 'rss' ? 'The whole process, analytics included' : 'Go runtime only (no RSS here)'}
        />
        <Tile icon={HardDrive} label="Stored" value={bytes(h.store.bytes_used)} sub={`${fmtInt(h.store.events)} events${h.store.bytes_per_event ? ` · ${h.store.bytes_per_event.toFixed(0)} B each` : ''}`} />
      </div>

      <section className="card hcard">
        <div className="hcard-head">
          <h2>Space for new data</h2>
          <Pill tone={diskTone}>{h.store.days_left > 0 ? h.store.days_left > 3650 ? "Lasts more than ten years" : `Lasts about ${fmtDays(h.store.days_left)}` : 'No visits in the last week'}</Pill>
        </div>
        <div className="hfigs">
          <span>
            <span className="faint">trckable's data</span>
            <b className="num">{bytes(h.store.bytes_used)}</b>
          </span>
          <span>
            <span className="faint">Free on the volume</span>
            <b className="num">{bytes(h.store.bytes_free)}</b>
          </span>
          <span>
            <span className="faint">Added per day</span>
            <b className="num">{h.store.events_per_day ? bytes(h.store.events_per_day * h.store.bytes_per_event) : '—'}</b>
          </span>
        </div>
        {h.ingest_error ? (
          <p className="hnote health-refusing">
            New visits are being turned away: {h.ingest_error}. Free some space: trckable tries again every 30 seconds by itself, and browsers keep what they could not send (except in cookieless
            mode).
          </p>
        ) : (
          <p className="hnote faint">When it is full, new visits are turned away until there is room again (tried every 30 seconds); nothing stored is harmed.</p>
        )}
      </section>

      <section className="card hcard">
        <div className="hcard-head">
          <h2>Backups</h2>
        </div>
        <Item
          icon={ArchiveRestore}
          label="Last backup"
          hint={
            h.backup.error
              ? `The last one failed ${since(h.backup.error_at)}: ${h.backup.error}`
              : h.backup.at
                ? `${bytes(h.backup.bytes)} · encrypted with this instance's key · ${h.backup.offsite && !h.backup.offsite_error && h.backup.offsite_at ? 'two kept here, the rest off-site' : 'seven kept here'}`
                : 'The first is written ten minutes after the server starts, then one a day'
          }
        >
          <Pill tone={backupTone}>{since(h.backup.at)}</Pill>
        </Item>
        <Item
          icon={CloudUpload}
          label="Off-site copy"
          hint={
            h.backup.offsite_error
              ? `The last copy failed: ${h.backup.offsite_error}`
              : h.backup.offsite
                ? `${h.backup.offsite} · kept ${h.backup.offsite_days} days`
                : 'Only on this machine. Set TRCKABLE_BACKUP_S3 to copy each backup to a bucket elsewhere.'
          }
        >
          <Pill tone={offTone}>{h.backup.offsite ? (h.backup.offsite_at ? since(h.backup.offsite_at) : 'None yet') : 'Off'}</Pill>
        </Item>
      </section>

      {h.key_on_volume && (
        <section className="card hcard">
          <div className="hcard-head">
            <h2>The instance key</h2>
            <Pill tone="warn">Only on this disk</Pill>
          </div>
          <p className="hnote faint">
            Backups and saved provider keys are encrypted with data/secret.key, which sits on the same disk as the backups. If the disk is lost, so is the key, and the backups cannot be read. Copy the file somewhere
            safe (for Docker: docker cp trckable:/data/secret.key .), or set its contents as TRCKABLE_SECRET.
          </p>
        </section>
      )}

      {h.payments && (
        <section className="card hcard">
          <div className="hcard-head">
            <h2>Payments</h2>
          </div>
          <Item icon={CreditCard} label="Providers connected" hint="Webhooks and a reconciliation for each one">
            <Pill tone={h.payments.connections > 0 ? 'ok' : 'warn'}>{h.payments.connections}</Pill>
          </Item>
          <Item icon={Webhook} label="Last webhook" hint={h.payments.pending > 0 ? `${h.payments.pending} waiting to be processed` : 'Nothing waiting'}>
            <Pill tone={h.payments.pending > 50 ? 'warn' : 'ok'}>{since(h.payments.last_event)}</Pill>
          </Item>
          <Item icon={RefreshCcw} label="Last reconciliation" hint="Each provider is checked every six hours for anything a webhook missed">
            <Pill tone={h.payments.last_sync && Date.now() / 1000 - h.payments.last_sync > 86400 ? 'warn' : 'ok'}>{since(h.payments.last_sync)}</Pill>
          </Item>
        </section>
      )}
    </>
  )
}
