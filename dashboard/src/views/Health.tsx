// Settings → Health. "Is this thing still fine?", answered without reading a
// log: events flowing, how far behind the writer is, what the disk holds and
// how long that lasts, whether backups are being made, and whether payments
// are arriving.
import { Activity, ArchiveRestore, CircleCheck, CloudUpload, Cpu, CreditCard, HardDrive, Inbox, RefreshCcw, TriangleAlert, Webhook } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, messageOf, type Health as H } from '../lib/api'
import { fmtInt } from '../lib/format'
import './Health.css'
import { Loading } from '../components/loading/Loading'

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

/** Seconds since a unix time. */
const ageOf = (unix: number) => Date.now() / 1000 - unix

const since = (unix?: number) => {
  if (!unix) return 'never'
  const s = Math.max(0, ageOf(unix))
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}

const fmtDays = (d: number) => {
  if (d > 3650) return "more than ten years"
  if (d > 730) return `${Math.round(d / 365)} years`
  if (d > 120) return `${Math.round(d / 30)} months`
  return `${Math.round(d)} days`
}

const uptime = (s: number) => {
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`
  if (s < 172800) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} days`
}

/** How long the free space lasts, or why that cannot be told. */
const lasts = (days: number) => {
  if (!(days > 0)) return 'No visits in the last week'
  return days > 3650 ? "Lasts more than ten years" : `Lasts about ${fmtDays(days)}`
}

type Tone = 'ok' | 'warn' | 'bad' | 'info'

function backupToneOf(b: H['backup']): Tone {
  if (b.error) return 'bad'
  if (!b.at) return 'warn'
  return ageOf(b.at) > 2 * 86400 ? 'bad' : 'ok'
}

function offToneOf(b: H['backup']): Tone {
  if (b.offsite_error) return 'bad'
  return b.offsite ? 'ok' : 'warn'
}

function diskToneOf(daysLeft: number): Tone {
  if (!(daysLeft > 0)) return 'info'
  if (daysLeft < 14) return 'bad'
  return daysLeft < 60 ? 'warn' : 'ok'
}

/** The top line: warming up, all fine, or how many things need a look. */
function stateOf(analytics: H['analytics'], issues: { tone: Tone; text: string }[]): { tone: Tone; title: string; sub?: string } {
  if (analytics === 'warming') return { tone: 'warn', title: 'Warming up the analytics store' }
  if (issues.length === 0) return { tone: 'ok', title: 'Everything is running' }
  return {
    tone: issues.some((i) => i.tone === 'bad') ? 'bad' : 'warn',
    title: issues.length === 1 ? 'Running, with one thing to look at' : `Running, with ${issues.length} things to look at`,
    sub: issues.map((i) => i.text).join(' · ').replace(/^./, (c) => c.toUpperCase()),
  }
}

function backupHint(b: H['backup']) {
  if (b.error) return `The last one failed ${since(b.error_at)}: ${b.error}`
  if (!b.at) return 'The first is written ten minutes after the server starts, then one a day'
  return `${bytes(b.bytes)} · encrypted with this instance's key · ${b.offsite && !b.offsite_error && b.offsite_at ? 'two kept here, the rest off-site' : 'seven kept here'}`
}

function offsiteHint(b: H['backup']) {
  if (b.offsite_error) return `The last copy failed: ${b.offsite_error}`
  if (b.offsite) return `${b.offsite} · every copy for 7 days, then the newest of each day, up to ${b.offsite_days} days`
  return 'Only on this machine. Set TRCKABLE_BACKUP_S3 to copy each backup to a bucket elsewhere.'
}

/** When the last off-site copy was made, if copies are made at all. */
function offsiteWhen(b: H['backup']) {
  if (!b.offsite) return 'Off'
  return b.offsite_at ? since(b.offsite_at) : 'None yet'
}

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
    const load = () => {
      api
        .health()
        .then((r) => {
          setH(r)
          setAt(new Date())
          setErr(null)
        })
        .catch((e: unknown) => setErr(messageOf(e)))
    }
    load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [])

  if (err && !h) return <div className="banner">{err}</div>
  if (!h) return <Loading height={320} />
  const lagTone: Tone = h.events.lag > 5000 ? 'warn' : 'ok'
  const backupTone = backupToneOf(h.backup)
  const offTone = offToneOf(h.backup)
  const diskTone = diskToneOf(h.store.days_left)
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
  const state = stateOf(h.analytics, issues)

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
          <Pill tone={diskTone}>{lasts(h.store.days_left)}</Pill>
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
          hint={backupHint(h.backup)}
        >
          <Pill tone={backupTone}>{since(h.backup.at)}</Pill>
        </Item>
        <Item
          icon={CloudUpload}
          label="Off-site copy"
          hint={offsiteHint(h.backup)}
        >
          <Pill tone={offTone}>{offsiteWhen(h.backup)}</Pill>
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
            <Pill tone={h.payments.last_sync && ageOf(h.payments.last_sync) > 86400 ? 'warn' : 'ok'}>{since(h.payments.last_sync)}</Pill>
          </Item>
        </section>
      )}
    </>
  )
}
