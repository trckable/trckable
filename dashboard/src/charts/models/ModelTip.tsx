// What the hover card says under a model: the figure, how it stands against the
// period before, and for D and E what they add (each channel; the running
// total). TimeTip writes the rest: the day, the notes, revenue, the details.
import { fmtInt } from '../../lib/format'
import { Hero } from '../TimeHero'
import type { TimeChartProps } from '../timeProps'
import { bucketLabel } from '../timeScale'
import { modelCopy } from './modelCopy'
import { changePct, foldStack, paceGap, paceSays, running, stackTotals } from './modelMath'

/** ▲ 12% vs 1,234 — a change against the period before, or nothing without one. */
export function Delta({ a, b, fmt, when }: { a: number; b: number; fmt: (n: number) => string; when?: string }) {
  const pct = changePct(a, b)
  return (
    <span className="ct-vs num">
      {pct !== null && <em className={pct >= 0 ? 'tone-up' : 'tone-down'}>{`${pct >= 0 ? modelCopy.up : modelCopy.down} ${Math.abs(pct)}%`}</em>} {modelCopy.vs(fmt(b))}
      {when ? ` · ${when}` : ''}
    </span>
  )
}

export function ModelBody({ p, i }: { p: TimeChartProps; i: number }) {
  const fmt = p.fmt ?? fmtInt
  const value = p.values[i] ?? 0
  const prev = p.ghost?.[i]
  const when = p.ghostLabels?.[i] ? bucketLabel(p.ghostLabels[i], p.bucket, true) : undefined
  if (p.model === 'E') {
    const sum = running(p.values)
    const was = running((p.ghost ?? []).slice(0, p.values.length))
    const gap = paceGap(p.values.slice(0, i + 1), (p.ghost ?? []).slice(0, i + 1))
    const { word, paint } = paceSays(gap, fmt)
    return (
      <>
        <Hero label={modelCopy.running(p.metric)} color="var(--accent)" big={fmt(sum[i] ?? 0)}>
          {p.ghost && (
            <span className="ct-vs num">
              <em style={{ color: paint }}>{word}</em> {modelCopy.vs(fmt(was[i] ?? 0))}
            </span>
          )}
        </Hero>
        <div className="ct-row">
          <span>{modelCopy.thisBucket}</span>
          <span className="num">{fmt(value)}</span>
        </div>
      </>
    )
  }
  if (p.model === 'D' && p.stack?.length) {
    const layers = foldStack(p.stack)
    const total = stackTotals(layers, p.values.length)[i] ?? 0
    return (
      <>
        <Hero label={p.metric} color="var(--accent)" big={fmt(total)}>
          {prev !== undefined && <Delta a={total} b={prev} fmt={fmt} when={when} />}
        </Hero>
        {[...layers].reverse().map((l) => (
          <div className="ct-row" key={l.name}>
            <span>
              <i style={{ background: l.color }} />
              {l.name}
            </span>
            <span className="num">{fmt(l.values[i] ?? 0)}</span>
          </div>
        ))}
      </>
    )
  }
  return (
    <Hero label={p.metric} color="var(--accent)" big={fmt(value)}>
      {prev !== undefined && <Delta a={value} b={prev} fmt={fmt} when={when} />}
    </Hero>
  )
}

/** The phone's card: one figure, one line under it, and the channels as small cells. */
export function modelBrief(p: TimeChartProps, i: number): { value: string; sub: string | null; cells: { label: string; value: string }[] } {
  const fmt = p.fmt ?? fmtInt
  const value = p.values[i] ?? 0
  const prev = p.ghost?.[i]
  if (p.model === 'E') {
    const gap = paceGap(p.values.slice(0, i + 1), (p.ghost ?? []).slice(0, i + 1))
    return { value: fmt(running(p.values)[i] ?? 0), sub: p.ghost ? paceSays(gap, fmt).word : null, cells: [] }
  }
  const pct = prev === undefined ? null : changePct(value, prev)
  const sub = pct === null ? null : `${pct >= 0 ? modelCopy.up : modelCopy.down} ${Math.abs(pct)}% ${modelCopy.vs(fmt(prev ?? 0))}`
  const cells = p.model === 'D' && p.stack?.length ? [...foldStack(p.stack)].reverse().map((l) => ({ label: l.name, value: fmt(l.values[i] ?? 0) })) : []
  return { value: fmt(value), sub, cells }
}
