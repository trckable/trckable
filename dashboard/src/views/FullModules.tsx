// Full mode's funnel tab (a visitor's journey is features/journey). This file
// is a lazy chunk, so Core never downloads it.
import { useEffect, useMemo, useState } from 'react'
import { Picker } from '../components/Picker'
import { api, messageOf, type FunnelResult, type FunnelStep, type ReportQuery, type Row, type Site } from '../lib/api'
import { FunnelResult as Result } from '../features/cards/FunnelResult'
import './FullModules.css'

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
  return (
    <div className="fn-panel">
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
      {res && <Result res={res} />}
    </div>
  )
}
