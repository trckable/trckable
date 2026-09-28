// Full mode's module views: funnels and the People card (a visitor's
// journey is features/journey). The weekly
// rhythm is a card of the chart grid now (features/fullcharts). This file is
// a lazy chunk, so Core never downloads it, and each card is skipped
// entirely when its module is off.
import { useEffect, useMemo, useState } from 'react'
import { Picker } from '../components/Picker'
import { api, messageOf, type FunnelResult, type FunnelStep, type ReportQuery, type Row, type Site } from '../lib/api'
import { fmtDuration, fmtInt } from '../lib/format'
import { CookielessOff } from '../features/cookieless/Off'
import './FullModules.css'
import { Loading } from '../components/loading/Loading'

/** Steps in order: how many carried on, and how long it took them. */
// The steps live in the address (see lib/url), so the header's Create →
// Funnel and a reload land on the same funnel.
export function Funnel({ site, query, pages, goals, steps, onSteps: setSteps }: { site: Site; query: ReportQuery; pages: Row[]; goals: Row[]; steps: FunnelStep[]; onSteps: (s: FunnelStep[]) => void }) {
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
  // Fewer than two steps is no funnel: drop the last result with them.
  const [prevActive, setPrevActive] = useState(active)
  if (prevActive !== active) {
    setPrevActive(active)
    if (active.length < 2) setRes(null)
  }

  useEffect(() => {
    if (active.length < 2) return
    let live = true
    api
      .funnel(site.id, query, active)
      .then((d) => {
        if (!live) return
        setRes(d.steps)
        setErr(null)
      })
      .catch((e: unknown) => live && setErr(messageOf(e)))
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
    return (rows ?? []).filter((e): e is typeof e & { visitor: string } => !!e.visitor && !seen.has(e.visitor) && !!seen.add(e.visitor)).slice(0, 8)
  }, [rows])
  if (site.cookieless) return <CookielessOff title="People" />
  const list = () => {
    if (!rows) return <Loading height={140} />
    if (people.length === 0) return <span className="faint">No visits recorded yet.</span>
    return (
      <ul className="people">
        {people.map((p) => (
          <li key={p.visitor}>
            <button type="button" onClick={() => onPick(p.visitor)}>
              <span className="dot" style={{ background: p.kind === 'goal' ? 'var(--accent)' : 'var(--text-3)', borderRadius: '50%' }} aria-hidden="true" />
              <span className="people-what">{p.kind === 'goal' ? '🎯 goal' : p.path}</span>
              <span className="faint">{[p.channel, p.country, p.device].filter(Boolean).join(' · ')}</span>
              <span className="faint num">{new Date(p.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </button>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className="card">
      <div className="card-head">
        <h2>People</h2>
        <span className="faint card-note" style={{ fontSize: 12 }}>
          The last visitors — open one to see everything they did
        </span>
      </div>
      {list()}
    </div>
  )
}
