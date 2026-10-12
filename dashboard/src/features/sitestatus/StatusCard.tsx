// A site that stopped sending visits explains itself, above its numbers: what
// happened and since when, what was checked from outside just now, and what
// to do. When visits return it shrinks to one line for a day.
import { useEffect, useState } from 'react'
import { Check, TriangleAlert, X } from 'lucide-react'
import { api, type Site } from '../../lib/api'
import { isViewer } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { copy } from './copy'
import { causeOf, rowsOf } from './rows'
import { GapChart } from './GapChart'
import { slotOf, useRecent } from './useRecent'
import { useMute } from './useMute'
import { firstAfter, fresh, readGap, writeGap } from './recovery'
import { statusOf } from './status'
import { silence, when } from './time'
import { useChecks } from './useChecks'
import '../signals/surge.css'
import './StatusCard.css'

function Gone({ site, last, down }: { site: Site; last: number; down: boolean }) {
  const { state, again } = useChecks(site.id)
  const recent = useRecent(site.id)
  const mute = useMute(site, !isViewer())
  const downSince = down ? site.check?.down_since : undefined
  useEffect(() => {
    const prev = readGap(site.id)
    if (!prev || prev.since !== last) writeGap(site.id, { since: last })
  }, [site.id, last])
  const result = state.phase === 'done' ? state.result : undefined
  const rows = result ? rowsOf(result, site.domain) : undefined
  return (
    <section className={'card status-card ' + (down ? 'down' : 'quiet')} aria-label={copy.label}>
      <header className="sgm-hero">
        <span className="sgm-badge" aria-hidden="true">
          <TriangleAlert size={18} strokeWidth={2} />
        </span>
        <b className="sgm-count">{silence(site)}</b>
        <span className="sgm-meta">
          <span className="sg-chip">{down ? copy.chipDown : copy.chipQuiet}</span>
          <span className="sgm-jump">{downSince ? copy.downSince(when(downSince)) : copy.sinceVisit(when(last))}</span>
        </span>
      </header>
      <p className="sgm-honest muted">{causeOf(rows, down)}</p>
      {recent && <GapChart slices={recent.slices} last={when(last)} at={slotOf(last, recent.now)} />}
      <div className="sgm-tiles">
        <section className="sgm-tile" aria-label={copy.tileVisit}>
          <h3>{copy.tileVisit}</h3>
          <p className="sgm-row">
            <span>{when(last)}</span>
          </p>
          <p className="sgm-row">{recent?.path ? <code>{recent.path}</code> : <span className="faint">{copy.noPage}</span>}</p>
        </section>
        <section className="sgm-tile" aria-label={copy.tileHome}>
          <h3>{copy.tileHome}</h3>
          <p className="sgm-row">
            <span>{site.domain}</span>
            {result && !result.error && <b>{copy.answered(result.status ?? 200, result.ms ?? 0)}</b>}
          </p>
        </section>
        <section className="sgm-tile status-checks" aria-label={copy.tileChecks} aria-live="polite" aria-busy={state.phase === 'checking'}>
          <h3>{copy.tileChecks}</h3>
          <ul>
            {state.phase === 'checking' && (
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
    </section>
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
    <p className="status-back" role="status">
      <Check size={15} strokeWidth={2.25} aria-hidden="true" />
      {copy.back(when(gap.back), spanLong(gap.back - gap.since))}
    </p>
  )
}

function spanLong(secs: number): string {
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))} min`
  if (secs < 86400) return `${Math.round(secs / 3600)} h`
  return `${Math.round(secs / 86400)} d`
}

/** Whether there is anything to say about this site's visits: a quiet spell now, or a gap that just closed. */
export function StatusCard({ site }: { site: Site }) {
  const status = statusOf(site)
  if (status === 'new') return null
  if (status === 'down' || status === 'quiet') return <Gone site={site} last={site.last_event_at ?? 0} down={status === 'down'} />
  return <Back site={site} />
}
