// Who came → Sources → AI: the visitors the AI channel sent, what share of all
// visitors that is, how it moved against the period before, a line for the
// days, and the assistants one by one. The channel is the server's own rule
// (its list of assistants), read through one filtered report.
import { useEffect, useState } from 'react'
import { BarList } from '../../charts/BarList'
import { moveOf } from '../../charts/change'
import { Loading } from '../../components/loading/Loading'
import { cachedReport, type ReportQuery, type Result } from '../../lib/api'
import { fmtInt, fmtPct } from '../../lib/format'
import { channelColor } from '../../lib/palette'
import { assistantOf, byAssistant } from './assistants'
import { extrasCopy } from './copy'
import './extras.css'

const c = extrasCopy.ai

/** The days as a line: no axis, no numbers, the shape of it. */
function Spark({ values }: { values: number[] }) {
  const top = Math.max(1, ...values)
  const pts = values.map((v, i) => `${values.length < 2 ? 50 : (i / (values.length - 1)) * 100},${22 - (v / top) * 20}`)
  return (
    <svg className="ai-spark" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label={c.trend}>
      <polyline points={pts.join(' ')} fill="none" stroke={channelColor('AI')} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function AiPanel({ site, query, all, rows, onPick }: { site: string; query: ReportQuery; all: number; rows: number; onPick: (referrer: string) => void }) {
  const [found, setFound] = useState<{ key: string; res: { current: Result; previous?: Result } | null } | null>(null)
  const key = `${site}|${query.from}|${query.to}|${query.compare ?? ''}|${query.cfrom ?? ''}|${query.testPayments ? 'test' : ''}|${JSON.stringify(query.filters ?? [])}`
  useEffect(() => {
    let live = true
    cachedReport(site, { ...query, daily: false, deep: false, filters: [...(query.filters ?? []), { dim: 'channel', value: 'AI' }] })
      .then((r) => live && setFound({ key, res: r }))
      .catch(() => live && setFound({ key, res: null }))
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content
  const here = found && found.key === key ? found : null
  if (!here) return <Loading height={164} />
  const res = here.res
  const visitors = res?.current.kpis.visitors ?? 0
  if (!res || visitors === 0) return <p className="faint kit-empty">{c.none}</p>
  const move = moveOf(visitors, res.previous?.kpis.visitors)
  const before = new Map(byAssistant(res.previous?.dims.referrer ?? []).map((a) => [a.name, a.visitors]))
  return (
    <>
      <div className="ai-head">
        <b className="num ai-count">{fmtInt(visitors)}</b>
        <span className="faint num">{c.share(fmtPct(all > 0 ? Math.min(1, visitors / all) : 0))}</span>
        {move && move.dir !== 'flat' && <span className={`num ai-move ${move.dir}`}>{`${move.dir === 'up' ? '▲' : '▼'} ${move.pct}%`}</span>}
        <Spark values={res.current.series.map((p) => p.visitors)} />
      </div>
      <BarList
        dimLabel={c.assistant}
        loading={false}
        whole={visitors}
        barColor={channelColor('AI')}
        prior={(host) => (res.previous ? (before.get(assistantOf(host)) ?? 0) : undefined)}
        emptyText={c.none}
        onPick={onPick}
        pickLabel={(host) => c.pick(assistantOf(host), host)}
        items={byAssistant(res.current.dims.referrer ?? []).slice(0, rows).map((a) => ({ key: a.referrer, label: a.name, title: a.referrer, value: a.visitors }))}
      />
    </>
  )
}
