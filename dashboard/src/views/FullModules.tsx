// Full mode's module views: the weekly rhythm, funnels and one visitor's
// journey. This file is a lazy chunk, so Core never downloads it, and each
// card is skipped entirely when its module is off.
import { Modal } from '../components/Modal'
import { isViewer } from '../lib/me'
import { useEffect, useMemo, useState } from 'react'
import { Picker } from '../components/Picker'
import { api, type FunnelResult, type FunnelStep, type Heatmap, type JourneyResult, type ReportQuery, type Row, type Site } from '../lib/api'
import { fmtDuration, fmtInt, fmtMoney } from '../lib/format'
import { openSettings } from '../lib/settings'
import './FullModules.css'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Hour by weekday: when the visits actually happen. */
export function Rhythm({ site, query }: { site: Site; query: ReportQuery }) {
  const [data, setData] = useState<Heatmap | null>(null)
  const [err, setErr] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  useEffect(() => {
    let live = true
    api
      .heatmap(site.id, query)
      .then((d) => live && setData(d))
      .catch(() => live && setErr(true))
    return () => {
      live = false
    }
  }, [site.id, query])
  if (err) return null
  const peak = data?.peak ?? 1
  // Monday-first rows; the server returns Sunday-first (DuckDB dow).
  const order = [1, 2, 3, 4, 5, 6, 0]
  return (
    <div className="card">
      <div className="card-head">
        <h2>Weekly rhythm</h2>
        <span className="faint card-note" style={{ fontSize: 12 }}>
          Visits by hour, in {site.timezone}
        </span>
      </div>
      {!data ? (
        <div className="skeleton" style={{ height: 150 }} />
      ) : (
        <div className="rhythm" onMouseLeave={() => setTip(null)}>
          {tip && (
            <div className="chart-tip" style={{ left: Math.min(tip.x + 12, 260), top: Math.max(tip.y - 40, 0) }} aria-hidden="true">
              {tip.text}
            </div>
          )}
          <div className="rhythm-hours" aria-hidden="true">
            {[0, 6, 12, 18].map((h) => (
              <span key={h} style={{ gridColumn: h + 1 }}>
                {h}:00
              </span>
            ))}
          </div>
          {order.map((d, row) => (
            <div key={d} className="rhythm-row">
              <span className="faint">{DAYS[row]}</span>
              <div className="rhythm-cells">
                {(data.cells[d] ?? []).map((n, h) => (
                  <i
                    key={h}
                    onMouseEnter={(e) => {
                      const box = e.currentTarget.closest('.rhythm')!.getBoundingClientRect()
                      const cell = e.currentTarget.getBoundingClientRect()
                      setTip({ x: cell.left - box.left, y: cell.top - box.top, text: `${DAYS[row]} ${String(h).padStart(2, '0')}:00 · ${fmtInt(n)} visits` })
                    }}
                    style={{ opacity: n ? 0.15 + (n / peak) * 0.85 : 0.05, background: 'var(--accent)' }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Steps in order: how many carried on, and how long it took them. */
export function Funnel({ site, query, pages, goals }: { site: Site; query: ReportQuery; pages: Row[]; goals: Row[] }) {
  const [steps, setSteps] = useState<FunnelStep[]>([])
  const [res, setRes] = useState<FunnelResult[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // A sensible first funnel: the busiest entry page, then the first goal.
  const suggested = useMemo<FunnelStep[]>(() => {
    const out: FunnelStep[] = []
    if (pages[0]) out.push({ kind: 'page', value: pages[0].value })
    if (pages[1]) out.push({ kind: 'page', value: pages[1].value })
    if (goals[0]) out.push({ kind: 'goal', value: goals[0].value })
    return out
  }, [pages, goals])
  const active = steps.length ? steps : suggested

  useEffect(() => {
    if (active.length < 2) return setRes(null)
    let live = true
    api
      .funnel(site.id, query, active)
      .then((d) => live && (setRes(d.steps), setErr(null)))
      .catch((e: Error) => live && setErr(e.message))
    return () => {
      live = false
    }
  }, [site.id, query, active])

  const options = [...pages.slice(0, 12).map((p) => ({ kind: 'page' as const, value: p.value })), ...goals.slice(0, 12).map((g) => ({ kind: 'goal' as const, value: g.value }))]
  const top = res?.[0]?.visitors ?? 0
  return (
    <div className="card">
      <div className="card-head">
        <h2>Funnel</h2>
        <span className="faint card-note" style={{ fontSize: 12 }}>
          Pages and goals, in order
        </span>
      </div>

      <div className="funnel-steps">
        {active.map((s, i) => (
          <span key={i} className="chip">
            <span className="faint">{i + 1}</span>
            {s.kind === 'goal' ? '🎯 ' : ''}
            {s.value}
            <button type="button" aria-label={`Remove ${s.value}`} onClick={() => setSteps(active.filter((_, j) => j !== i))}>
              ×
            </button>
          </span>
        ))}
        {active.length < 8 && (
          <Picker
            label="Add a step"
            placeholder="Search a page or goal…"
            onPick={(id) => {
              const [kind, ...rest] = id.split(':')
              setSteps([...active, { kind: kind as 'page' | 'goal', value: rest.join(':') }])
            }}
            items={options.map((o) => ({ id: o.kind + ':' + o.value, label: o.value, group: o.kind === 'goal' ? 'Goals' : 'Pages' }))}
            trigger={() => <span style={{ fontSize: 13 }}>+ Add step</span>}
          />
        )}
      </div>

      {err && <span className="faint">{err}</span>}
      {active.length < 2 && !err && <span className="faint">Pick at least two steps.</span>}
      {res && (
        <div className="funnel">
          {res.map((s, i) => (
            <div key={i} className="funnel-step">
              <div className="funnel-bar" style={{ width: top ? `${Math.max(4, (s.visitors / top) * 100)}%` : '4%' }} />
              <div className="funnel-label">
                <b>{s.value}</b>
                <span className="num">{fmtInt(s.visitors)}</span>
              </div>
              <div className="funnel-meta faint num">
                {i === 0 ? '100%' : `${Math.round(s.rate * 100)}% of previous · ${Math.round(s.of_total * 100)}% of all`}
                {i > 0 && s.median_s > 0 && ` · ${fmtDuration(s.median_s)} later`}
                {s.dropped > 0 && ` · ${fmtInt(s.dropped)} stopped here`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The last people on the site, each one a door into their journey. */
export function People({ site, onPick }: { site: Site; onPick: (visitor: string) => void }) {
  const [rows, setRows] = useState<{ ts: string; path: string; kind: string; visitor?: string; channel?: string; country?: string; device?: string }[] | null>(null)
  useEffect(() => {
    let live = true
    api
      .events(site.id, 40)
      .then((d) => live && setRows(d.events))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [site.id])
  // One row per visitor: their newest event.
  const people = useMemo(() => {
    const seen = new Set<string>()
    return (rows ?? []).filter((e) => e.visitor && !seen.has(e.visitor) && seen.add(e.visitor)).slice(0, 8)
  }, [rows])
  return (
    <div className="card">
      <div className="card-head">
        <h2>People</h2>
        <span className="faint card-note" style={{ fontSize: 12 }}>
          The last visitors — open one to see everything they did
        </span>
      </div>
      {!rows ? (
        <div className="skeleton" style={{ height: 140 }} />
      ) : people.length === 0 ? (
        <span className="faint">No visits recorded yet.</span>
      ) : (
        <ul className="people">
          {people.map((p) => (
            <li key={p.visitor}>
              <button type="button" onClick={() => onPick(p.visitor!)}>
                <span className="dot" style={{ background: p.kind === 'goal' ? 'var(--accent)' : 'var(--text-3)', borderRadius: '50%' }} aria-hidden="true" />
                <span className="people-what">{p.kind === 'goal' ? '🎯 goal' : p.path}</span>
                <span className="faint">{[p.channel, p.country, p.device].filter(Boolean).join(' · ')}</span>
                <span className="faint num">{new Date(p.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One visitor's whole history, opened from the live feed or the People card. */
export function JourneyDrawer({ site, visitor, query, onClose }: { site: Site; visitor: string; query: ReportQuery; onClose: () => void }) {
  const [data, setData] = useState<JourneyResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api
      .journey(site.id, visitor, query)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setErr(e.message))
    return () => {
      live = false
    }
  }, [site.id, visitor, query])
  const when = (s: string) => new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <Modal label="Visitor journey" className="wide" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2>Visitor</h2>
        <span className="faint num">{visitor.slice(0, 8)}</span>
        <span className="spacer" style={{ flex: 1 }} />
        {/* The one place an owner is looking at a real person, so it is the
            one place a data request can start from. */}
        {!isViewer() && (
          <button
            type="button"
            className="btn"
            title="Export or erase everything held about this visitor"
            onClick={() => openSettings(site, 'privacy', { visitor })}
          >
            Data request
          </button>
        )}
        <button type="button" className="btn icon ghost" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {err && <span className="faint">{err}</span>}
      {!data && !err && <div className="skeleton" style={{ height: 160 }} />}
      {data?.payments && data.payments.length > 0 && (
        <div className="banner" style={{ borderColor: 'var(--money)' }}>
          <span className="money-dot" />
          Paid {data.payments.map((p) => fmtMoney(p.amount, data.currency ?? 'USD', 2)).join(', ')} · {data.payments[0].provider}
        </div>
      )}
      <div className="journey">
        {data?.journey.visits.map((v, i) => (
          <div key={i} className="journey-visit">
            <div className="journey-head">
              <b>{when(v.start)}</b>
              <span className="faint">
                {[v.channel, v.referrer, v.country, v.device].filter(Boolean).join(' · ')}
              </span>
              <span className="spacer" style={{ flex: 1 }} />
              <span className="faint num">
                {fmtInt(v.pageviews)} views · {fmtDuration(v.engaged_s)}
              </span>
            </div>
            <ul className="journey-events">
              {v.events.map((e, j) => (
                <li key={j}>
                  <span className="faint num">{new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                  {e.kind === 'goal' ? <b style={{ color: 'var(--accent)' }}>🎯 {e.goal}</b> : <span>{e.path}</span>}
                  {e.props && <span className="faint num">{e.props}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {data?.journey.truncated && <span className="faint">Older visits are not shown.</span>}
    </Modal>
  )
}
