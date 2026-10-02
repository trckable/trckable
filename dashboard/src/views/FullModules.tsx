// Full mode's funnel tab (a visitor's journey is features/journey). This file
// is a lazy chunk, so Core never downloads it.
import { useEffect, useMemo, useState } from 'react'
import { Target } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { Picker } from '../components/Picker'
import { openCreate } from '../features/create/openCreate'
import { type FunnelResult, type FunnelStep, type ReportQuery, type Row, type Site, more } from '../lib/apiMore'
import { words } from '../lib/errors'
import { deepCopy } from '../features/cards/deepCopy'
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
    more
      .funnel(site.id, query, active)
      .then((d) => {
        if (!live) return
        setRes(d.steps)
        setErr(null)
      })
      .catch((e: unknown) => live && setErr(words(e)))
    return () => {
      live = false
    }
  }, [site.id, query, active])

  const options = [...pages.slice(0, 12).map((p) => ({ kind: 'page' as const, value: p.value })), ...goals.slice(0, 12).map((g) => ({ kind: 'goal' as const, value: g.value }))]
  const c = deepCopy.funnel
  return (
    <div className="fn-panel">
      <div className="funnel-steps">
        {active.map((s, i) => (
          <span key={i} className="chip" title={s.value}>
            <span className="faint">{i + 1}</span>
            {s.kind === 'goal' && <Target size={11} strokeWidth={1.75} aria-hidden="true" />}
            <span className="chip-name">{s.value}</span>
            <button type="button" aria-label={c.remove(s.value)} onClick={() => setSteps(active.filter((_, j) => j !== i))}>
              ×
            </button>
          </span>
        ))}
        {active.length < 8 && (
          <Picker
            label={c.add}
            placeholder={c.search}
            onPick={(id) => {
              const [kind, ...rest] = id.split(':')
              setSteps([...active, { kind: kind as 'page' | 'goal', value: rest.join(':') }])
            }}
            items={options.map((o) => ({ id: o.kind + ':' + o.value, label: o.value, group: o.kind === 'goal' ? c.goals : c.pages }))}
            trigger={() => <span>{c.addLabel}</span>}
          />
        )}
      </div>

      {err && <span className="faint">{err}</span>}
      {active.length < 2 && !err && <EmptyState line={c.empty} action={c.emptyAction} onAction={openCreate} />}
      {res && <Result res={res} />}
    </div>
  )
}
