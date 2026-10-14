// A site that stopped sending visits explains itself from a floating badge: how long, and a panel under it with what happened and since
// when, what was checked from outside just now, and what to do. When visits
// return the badge says so for a day.
import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, Moon, TriangleAlert, X } from 'lucide-react'
import { AnchoredPop } from '../../components/AnchoredPop'
import { api, type Site } from '../../lib/api'
import { isViewer } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { navigate } from '../../lib/url'
import { copy as incidents } from '../incidents/copy'
import { incidentsPath } from '../incidents/route'
import { copy } from './copy'
import { downCopy } from './downCopy'
import { causeOf, rowsOf } from './rows'
import { GapChart } from './GapChart'
import { slotOf, useRecent } from './useRecent'
import { useMute } from './useMute'
import { firstAfter, fresh, readGap, writeGap } from './recovery'
import { statusOf } from './status'
import { silence, span, when } from './time'
import { useChecks } from './useChecks'
import { useProbes } from './useProbes'
import { ProbeList } from './ProbeList'
import { Blocked } from './Blocked'
import '../signals/surge.css'
import './StatusCard.css'

/** How long the badge says: since the probe found the site down, else since its last visit. */
function ageOf(site: Site): string {
  return site.down_since ? span(Date.now() / 1000 - site.down_since) : silence(site)
}

export function StatusPanel({ site, last, down }: { site: Site; last: number; down: boolean }) {
  const { state, again } = useChecks(site.id)
  const recent = useRecent(site.id)
  const probes = useProbes(site.id)
  const mute = useMute(site, !isViewer())
  const probed = down ? site.down_since : undefined
  const downSince = down ? (probed ?? site.check?.down_since) : undefined
  const result = state.phase === 'done' ? state.result : undefined
  const rows = result ? rowsOf(result, site.domain) : undefined
  return (
    <div className={'status-card ' + (down ? 'down' : 'quiet')}>
      <header className="sgm-hero">
        <span className="sgm-badge" aria-hidden="true">
          <TriangleAlert size={18} strokeWidth={2} />
        </span>
        <b className="sgm-count">{ageOf(site)}</b>
        <span className="sgm-meta">
          <span className="sg-chip">{down ? copy.chipDown : copy.chipQuiet}</span>
          <span className="sgm-jump">{downSince ? copy.downSince(when(downSince)) : copy.sinceVisit(when(last))}</span>
        </span>
      </header>
      <p className="sgm-honest muted">{probed ? downCopy.bar(site.down_cause ?? '') : causeOf(rows, down)}</p>
      {site.probe_blocked_since && <p className="sgm-honest muted">{downCopy.blocked}</p>}
      {last > 0 && recent && <GapChart slices={recent.slices} last={when(last)} at={slotOf(last, recent.now)} />}
      <div className="sgm-tiles">
        <section className="sgm-tile" aria-label={copy.tileVisit}>
          <h3>{copy.tileVisit}</h3>
          <p className="sgm-row">
            <span>{last > 0 ? when(last) : copy.noPage}</span>
          </p>
          <p className="sgm-row">{recent?.path ? <code>{recent.path}</code> : <span className="faint">{copy.noPage}</span>}</p>
        </section>
        <section className="sgm-tile" aria-label={copy.tileHome}>
          <h3>{copy.tileHome}</h3>
          <p className="sgm-row">
            <span>{site.domain}</span>
            {probed && site.down_cause && <b>{site.down_cause}</b>}
            {result && !result.error && <b>{copy.answered(result.status ?? 200, result.ms ?? 0)}</b>}
          </p>
        </section>
        <section className="sgm-tile status-checks" aria-label={copy.tileChecks} aria-live="polite" aria-busy={state.phase === 'checking'}>
          <h3>{copy.tileChecks}</h3>
          <ul>
            <ProbeList probes={probes} />
            {state.phase === 'checking' && probes.length === 0 && (
              <li className="wait">
                <span className="btn-spin" aria-hidden="true" />
                {copy.checking}
              </li>
            )}
            {rows?.map((r) => (
              <li key={r.id} className={r.ok ? 'ok' : 'bad'} data-check={r.id}>
                {r.ok ? <Check size={15} strokeWidth={2.25} aria-hidden="true" /> : <X size={15} strokeWidth={2.25} aria-hidden="true" />}
                <span>
                  <b>{r.label}</b> {r.text}
                </span>
              </li>
            ))}
            {state.phase === 'limited' && <li className="faint">{copy.tryLater}</li>}
            {state.phase === 'failed' && <li className="faint">{copy.failed}</li>}
          </ul>
        </section>
      </div>
      <div className="sgm-actions">
        {mute.have && (mute.on ? (
          <span className="status-muted">
            {copy.muted(when(mute.until))} · <button type="button" className="linkish" onClick={() => void mute.undo()}>{copy.undo}</button>
          </span>
        ) : (
          <button type="button" className="btn ghost" onClick={() => void mute.mute()}>
            {copy.mute}
          </button>
        ))}
        <a className="btn ghost" href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer">
          {copy.open}
        </a>
        {!isViewer() && (
          <button type="button" className="btn ghost" onClick={() => openSettings(site, 'install')}>
            {copy.guide}
          </button>
        )}
        <button type="button" className="btn primary" onClick={again} disabled={state.phase === 'checking'}>
          {copy.again}
        </button>
      </div>
      <HistoryLink site={site} />
    </div>
  )
}


/** The one way on to the record of past incidents, quiet at the panel's foot. */
function HistoryLink({ site }: { site: Site }) {
  const href = incidentsPath(site.domain)
  return (
    <a
      className="status-history"
      href={href}
      onClick={(e) => {
        e.preventDefault()
        navigate(href)
      }}
    >
      {site.down_since ? downCopy.see : incidents.history}
    </a>
  )
}

/** The floating badge: the state and how long; it opens the panel up from its corner, or a sheet on a phone. */
function Gone({ site, last, down }: { site: Site; last: number; down: boolean }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [sheet] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const prev = readGap(site.id)
    if (last > 0 && (!prev || prev.since !== last)) writeGap(site.id, { since: last })
  }, [site.id, last])
  // On a desktop the panel is ours to close; the sheet's popover closes itself.
  useEffect(() => {
    if (!open || sheet) return
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btn.current?.focus()
    }
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open, sheet])
  const Icon = down ? CircleAlert : Moon
  return (
    <div ref={box} className="status-float">
      {open && !sheet && (
        <div className="status-pop" role="dialog" aria-label={copy.label}>
          <StatusPanel site={site} last={last} down={down} />
        </div>
      )}
      <button
        ref={btn}
        type="button"
        className={'status-badge ' + (down ? 'down' : 'quiet')}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={copy.label}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon size={15} strokeWidth={2} aria-hidden="true" />
        {copy.badge(down, ageOf(site))}
      </button>
      {open && sheet && (
        <AnchoredPop anchor={btn} label={copy.label} className="status-pop" onClose={() => setOpen(false)}>
          {() => <StatusPanel site={site} last={last} down={down} />}
        </AnchoredPop>
      )}
    </div>
  )
}

/** Visits are back after a gap this browser saw: one line, for a day. */
function Back({ site }: { site: Site }) {
  const [gap, setGap] = useState(() => readGap(site.id))
  const since = gap?.since
  const open = gap !== null && gap.back === undefined
  useEffect(() => {
    if (since === undefined || !open) return
    let current = true
    api
      .events(site.id, 100)
      .then((r) => {
        if (!current) return
        const back = firstAfter(since, r.events.map((e) => Date.parse(e.ts) / 1000))
        const next = back === undefined ? null : { since, back }
        writeGap(site.id, next)
        setGap(next)
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [site.id, since, open])
  if (!gap || gap.back === undefined) return null
  if (!fresh(gap)) {
    writeGap(site.id, null)
    return null
  }
  return (
    <div className="status-float">
      <a className="status-badge back" href={incidentsPath(site.domain)} title={copy.back(when(gap.back), spanLong(gap.back - gap.since))} onClick={(e) => { e.preventDefault(); navigate(incidentsPath(site.domain)) }}>
        <Check size={15} strokeWidth={2.25} aria-hidden="true" />
        {copy.backBadge(spanLong(gap.back - gap.since))}
      </a>
    </div>
  )
}

function spanLong(secs: number): string {
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))} min`
  if (secs < 86400) return `${Math.round(secs / 3600)} h`
  return `${Math.round(secs / 86400)} d`
}

/** The badge, if there is anything to say about this site's visits: a quiet spell now, or a gap that just closed. */
export function StatusCard({ site }: { site: Site }) {
  const status = statusOf(site)
  if (status === 'new') return site.probe_blocked_since ? <Blocked /> : null
  if (status === 'down' || status === 'quiet') return <Gone site={site} last={site.last_event_at ?? 0} down={status === 'down'} />
  return site.probe_blocked_since ? <Blocked /> : <Back site={site} />
}
