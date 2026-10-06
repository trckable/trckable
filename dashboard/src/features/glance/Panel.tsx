// Level two: the detail panel. A right-hand sheet on a desktop, a bottom sheet
// on a phone (swipe the handle down to close). Chart, chips, a sortable table,
// or the setup for a tile that is not set up yet.
import { useRef } from 'react'
import { exportURL, type ReportQuery, type Site } from '../../lib/api'
import { fmtDuration, fmtInt, fmtPct } from '../../lib/format'
import { fmtDay } from '../../lib/dates'
import { setView, type ViewState } from '../../lib/url'
import { copy } from './copy'
import type { TableRow, TileData } from './model'
import { PanelTable } from './PanelTable'
import { useSheet } from './useSheet'

export type Open = { tile: TileData | 'help'; key?: string; opener: HTMLElement | null }

interface Props {
  open: Open
  site: Site
  query: ReportQuery
  view: ViewState
  period: string
  labels: string[]
  money?: (minor: number) => string
  onClose: () => void
  onGoal?: () => void
  onConnect: () => void
  onSearch: () => void
  /** Drops the filter a search result opened the panel with. */
  onUnpick: () => void
}

const SWIPE = 80

function sayChart(unit: TileData['chart']['unit'], n: number, money?: (n: number) => string): string {
  if (unit === 'pct') return fmtPct(n / 100)
  if (unit === 'time') return fmtDuration(n)
  if (unit === 'money' && money) return money(n)
  return fmtInt(n)
}

/** The line under the value: the tile's story, or what is missing for a tile not set up. */
function setupTitle(t: TileData): string {
  if (!t.setup) return t.story
  return t.setup === 'goal' ? copy.setupGoalTitle : copy.setupRevenueTitle
}

const chartBar = (n: number, max: number) => {
  if (n === 0) return 'zero'
  return n === max ? 'best' : ''
}

function Chart({ t, labels, money }: { t: TileData; labels: string[]; money?: (n: number) => string }) {
  const v = t.chart.values
  const max = Math.max(1, ...v)
  const say = (n: number) => sayChart(t.chart.unit, n, money)
  if (!v.length) return null
  return (
    <div className="g-chart" role="img" aria-label={copy.chartLabel(t.chart.name)}>
      {v.map((n, i) => (
        <i key={i} className={chartBar(n, max)} style={{ height: `${Math.max(3, (n / max) * 100)}%` }} title={`${fmtDay((labels[i] ?? '').slice(0, 10))}: ${say(n)}`} />
      ))}
    </div>
  )
}

export function Panel(p: Props) {
  const ref = useRef<HTMLElement>(null)
  const drag = useRef<number | null>(null)
  useSheet(ref, p.onClose, p.open.opener)
  const t = p.open.tile
  const help = t === 'help'
  const label = help ? copy.helpTitle : t.label
  const all = help ? [] : t.rows
  const rows = p.open.key === undefined ? all : all.filter((r) => r.key === p.open.key)
  const goal = !help && t.setup === 'goal'
  const picked = help ? undefined : t.rows.find((r) => r.key === p.open.key)
  const filterRow = (r: TableRow) => {
    if (help) return
    const rest = p.view.filters.filter((f) => f.dim !== t.dim)
    setView({ filters: [...rest, { dim: t.dim, value: r.key }], day: undefined })
    p.onClose()
  }
  return (
    <div className="g-sheet-wrap">
      <button type="button" className="g-backdrop" aria-label={copy.closePanel} tabIndex={-1} onClick={p.onClose} />
      <aside ref={ref} className="g-sheet" role="dialog" aria-modal="true" aria-label={copy.panel(label)} tabIndex={-1}>
        <div
          className="g-grab"
          onPointerDown={(e) => {
            drag.current = e.clientY
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerUp={(e) => {
            if (drag.current !== null && e.clientY - drag.current > SWIPE) p.onClose()
            drag.current = null
          }}
        >
          <span />
        </div>
        <div className="g-sheet-top">
          <span className="g-sheet-title">{copy.panelTitle(label, p.period)}</span>
          <div className="g-sheet-actions">
            <button type="button" className="g-ghost" onClick={() => setView({ compare: p.view.compare === 'none' ? 'previous' : 'none' })}>{copy.compare}</button>
            <a className="g-ghost" href={exportURL(p.site.id, p.query)} download>{copy.export}</a>
            <button type="button" className="g-close" aria-label={copy.close} onClick={p.onClose}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
        {help ? (
          <div className="g-vs">
            <span className="g-sheet-value">{copy.helpTitle}</span>
            <span className="g-story">{copy.helpBody}</span>
          </div>
        ) : (
          <>
            <div className="g-vs">
              <span className={`g-sheet-value ${t.tone}`}>{t.value}</span>
              <span className="g-story">{setupTitle(t)}</span>
            </div>
            {t.setup ? (
              <>
                <p className="g-story">{goal ? copy.setupGoalBody : copy.setupRevenueBody}</p>
                <button type="button" className="g-cta" onClick={goal ? p.onGoal : p.onConnect}>{goal ? copy.setupGoalCta : copy.setupRevenueCta}</button>
              </>
            ) : (
              <>
                <Chart t={t} labels={p.labels} money={p.money} />
                <div className="g-chips">
                  <span className="g-chip on">{copy.dimName[t.dim]}</span>
                  {picked && <button type="button" className="g-chip on" aria-label={copy.removeFilter(picked.label)} onClick={p.onUnpick}>{picked.label} ×</button>}
                  <button type="button" className="g-chip add" onClick={p.onSearch}>{copy.addFilter}</button>
                </div>
                <PanelTable rows={rows} dimName={copy.dimName[t.dim]} onRow={filterRow} />
                {rows.length > 0 && <p className="g-hint-left">{copy.filterHint}</p>}
              </>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
