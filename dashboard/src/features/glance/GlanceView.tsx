// Data's Glance format: hero, alert, tiles, and the two layers over them (the
// detail panel and ⌘K). One report in, nothing fetched here.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { caps } from '../../lib/keys'
import type { Report, ReportQuery, Site } from '../../lib/api'
import { PRESETS, fmtRange, todayIn, type Range } from '../../lib/dates'
import type { ViewState } from '../../lib/url'
import { copy } from './copy'
import { Hero } from './Hero'
import { modelOf, type TileData } from './model'
import { Palette } from './Palette'
import { Panel, type Open } from './Panel'
import { indexOf, type Pick } from './search'
import { AlertBanner, GlanceSkeleton, Tiles } from './Tiles'

const ProviderCard = lazy(() => import('../overview/ProviderCard').then((m) => ({ default: m.ProviderCard })))

export interface GlanceProps {
  site: Site
  query: ReportQuery
  data: Report
  range: Range
  view: ViewState
  money?: (minor: number) => string
  onGoal?: () => void
  loading: boolean
  error?: string | null
  onRetry?: () => void
}

const isFind = (e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'

export default function GlanceView(p: GlanceProps) {
  const today = todayIn(p.site.timezone)
  const [now] = useState(() => Date.now())
  const m = useMemo(
    () => modelOf({ data: p.data, today, now, money: p.money, lastEventAt: p.site.last_event_at ? p.site.last_event_at * 1000 : undefined }),
    [p.data, today, now, p.money, p.site.last_event_at],
  )
  const [open, setOpen] = useState<Open | null>(null)
  const [find, setFind] = useState<{ opener: HTMLElement | null } | null>(null)
  const [connect, setConnect] = useState(false)
  const items = useMemo(() => indexOf(m.tiles), [m.tiles])
  const labels = p.data.current.series.map((x) => x.t)
  const period = PRESETS.find((x) => x.id === p.view.period)?.label ?? fmtRange(p.range, today)

  // ⌘K / Ctrl+K: ahead of the page's own handler, so Glance's search is the one that opens.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!isFind(e)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      setFind((f) => (f ? null : { opener: document.activeElement as HTMLElement | null }))
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [])

  const openTile = (t: TileData, el: HTMLElement | null, key?: string) => setOpen({ tile: t, key, opener: el })
  const fromSearch = (pk: Pick) => {
    const t = m.tiles.find((x) => x.key === pk.tile)
    const opener = find?.opener ?? null
    setFind(null)
    if (t) setOpen({ tile: t, key: pk.key, opener })
  }
  const fromAlert = (el: HTMLElement) => {
    const a = m.alert
    if (!a) return
    const t = a.tile === 'help' ? 'help' : m.tiles.find((x) => x.key === a.tile)
    if (t) setOpen({ tile: t, opener: el })
  }

  // The numbers of another period are on their way: blocks at the final sizes, no layout shift.
  const settling = p.loading && !p.error && (p.data.from !== p.range.from || p.data.to !== p.range.to)
  if (settling) return <div className="glance"><GlanceSkeleton /></div>
  return (
    <div className="glance">
      <div className="g-top">
        <button type="button" className="g-find" aria-label={copy.findLabel} onClick={(e) => setFind({ opener: e.currentTarget })}>
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="none" /><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          <span className="g-find-label">{copy.find}</span>
          <span className="g-kbd" aria-hidden="true">{caps('mod+k').join('')}</span>
        </button>
      </div>
      <Hero m={m} period={p.view.period} range={p.range} today={today} />
      {m.alert && <AlertBanner alert={m.alert} onOpen={fromAlert} />}
      <Tiles tiles={m.tiles} failed={!!p.error} onOpen={(t, el) => openTile(t, el)} onRetry={p.onRetry} />
      {createPortal(<div className="g-layer">
      {open && (
          <Panel
            key={`${typeof open.tile === 'string' ? open.tile : open.tile.key}|${open.key ?? ''}`}
            open={open}
            site={p.site}
            query={p.query}
            view={p.view}
            period={period}
            labels={labels}
            money={p.money}
            onClose={() => setOpen(null)}
            onGoal={p.onGoal && (() => { setOpen(null); p.onGoal?.() })}
            onConnect={() => { setOpen(null); setConnect(true) }}
            onSearch={() => setFind({ opener: null })}
            onUnpick={() => setOpen({ ...open, key: undefined })}
          />
        )}
        {find && <Palette items={items} opener={find.opener} onPick={fromSearch} onClose={() => setFind(null)} />}
      </div>, document.body)}
      {connect && (
        <Suspense fallback={null}>
          <ProviderCard site={p.site} onClose={() => setConnect(false)} />
        </Suspense>
      )}
    </div>
  )
}
