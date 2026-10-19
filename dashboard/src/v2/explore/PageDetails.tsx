// What Explore knows about one page, in a sheet over it: how far people read down it and how fast it loads. Opened from
// the ⋯ menu or the note under the pages table, while a page is the filter.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { heatApi } from '../../features/heatmap/api'
import { markHeatDone } from '../../features/heatmap/guide'
import { can } from '../../lib/permissions'
import { isOn } from '../../lib/modules'
import { modulesChanged, useMods } from '../../lib/useMods'
import { glow, pageSize, place, strength, busiest } from '../../features/heatmap/model'
import { lazyLoad } from '../../lib/lazyLoad'
import { MIN_VITALS } from '../../lib/api'
import { fail, more, type Site } from '../../lib/apiMore'
import type { Range } from '../../lib/dates'
import { queryOf } from '../../lib/dashQuery'
import type { ViewState } from '../../lib/url'
import { fmtFixed } from '../../lib/format'
import { MkPortal } from '../ui/Portal'
import { XSec } from '../ui/XBits'
import { copy } from './copy'
import { useLoad } from './data/useLoad'
import { gradeOf } from './data/mapSections'
import { pageDetails } from './pageStore'

const STEPS = ['0%', '25%', '50%', '75%', '90%']

// The page's own heatmap (features/heatmap) is its own chunk, fetched when it is first asked for.
const HeatOverlay = lazyLoad(() => import('../../features/heatmap/HeatOverlay'))
const HeatModal = lazyLoad(() => import('../../features/heatmap/HeatModal'))

/** Where people clicked on the page, as dots in a small box: the real counts, placed as the full heatmap places them. */
function Clicks({ site, range, page, q }: { site: Site; range: Range; page: string; q: ReturnType<typeof queryOf> }) {
  const [open, setOpen] = useState(false)
  const [about, setAbout] = useState(false)
  const [demo, setDemo] = useState(false)
  const mods = useMods(site.id)
  const key = [site.id, range.from, range.to, page].join('|')
  const heat = useLoad(`h|${key}`, (signal) => heatApi.map(site.id, q, page, 0, signal), true)
  const map = heat.state === 'ok' && (heat.data.views > 0 || heat.data.clicks.length > 0) ? heat.data : null
  // Nothing recorded: say what a heatmap shows (nobody is recorded), with an example, and for an owner the way to turn it on.
  const turnOn = () =>
    more
      .setModule(site.id, 'heatmaps', true)
      .then(() => {
        markHeatDone(site.id)
        modulesChanged()
        setAbout(false)
      })
      .catch((e: unknown) => fail(e))
  if (!map) {
    const off = mods !== null && !isOn(mods, 'heatmaps') && can('site.settings')
    return (
      <div className="mk-quiet">
        {heat.state === 'loading' ? copy.loading : copy.noHeat}
        {heat.state !== 'loading' && off && (
          <>
            {' '}
            <button type="button" className="xb" onClick={() => setAbout(true)}>
              {copy.aboutHeat}
            </button>
          </>
        )}
        {about && (
          <HeatModal site={site} path={page} views={heat.state === 'ok' ? heat.data.views : 0} onClose={() => setAbout(false)} onPreview={() => setDemo(true)} onGo={() => void turnOn()} />
        )}
        {demo && <HeatOverlay site={site} path={page} query={q} demo onClose={() => setDemo(false)} />}
      </div>
    )
  }
  const size = pageSize(map)
  const top = busiest(map.clicks)
  return (
    <>
      <button type="button" className="heat" title={copy.openHeat(page)} aria-label={copy.openHeat(page)} onClick={() => setOpen(true)}>
        {map.clicks.slice(0, 40).map((s) => {
          const at = place(s, size.w)
          const g = glow(s, size.w) * (0.6 + strength(s.n, top) * 0.8)
          return <i key={`${s.el}|${s.cx}|${s.cy}`} style={{ left: `${Math.min(100, (at.x / size.w) * 100)}%`, top: `${Math.min(100, (at.y / size.h) * 100)}%`, '--s': `${Math.round(g)}px` } as CSSProperties} />
        })}
      </button>
      {open && <HeatOverlay site={site} path={page} query={q} onClose={() => setOpen(false)} />}
    </>
  )
}

function Body({ site, range, view, page }: { site: Site; range: Range; view: ViewState; page: string }) {
  const q = { ...queryOf(view, range), compare: undefined, cfrom: undefined, cto: undefined, filters: [{ dim: 'page', value: page }] }
  const key = [site.id, range.from, range.to, page].join('|')
  const read = useLoad(key, (signal) => more.scroll(site.id, q, signal), true)
  const speed = useLoad(`v|${key}`, () => more.vitals(site.id, q), true)
  const reached = read.state === 'ok' && read.data.samples > 0 ? [100, ...read.data.reached.map((x) => (x <= 1 ? Math.round(x * 100) : Math.round(x)))] : null
  const v = speed.state === 'ok' && speed.data.samples >= MIN_VITALS ? speed.data : null
  // Each score is built from its own page views: a browser reports what it can measure.
  const has = (score: number | null | undefined, n: number | undefined) => (v && score != null && (n ?? v.samples) >= MIN_VITALS ? score : null)
  const lcpMs = has(v?.lcp_ms, v?.lcp_n)
  const inpMs = has(v?.inp_ms, v?.inp_n)
  const clsK = has(v?.cls_1k, v?.cls_n)
  const lcp = lcpMs != null ? lcpMs / 1000 : null
  const dash = '\u2013'
  let line: string = copy.noSpeed
  if (speed.state === 'loading') line = copy.loading
  if (v) line = copy.speedLine(lcp != null ? `${fmtFixed(lcp, 1)} s` : dash, inpMs != null ? `${Math.round(inpMs)} ms` : dash, clsK != null ? fmtFixed(clsK / 1000, 2) : dash)
  return (
    <div className="px">
      <b>{page}</b>
      <XSec a={copy.scrollDepth} b={copy.howFar} />
      {reached ? (
        reached.map((x, i) => (
          <div key={STEPS[i]} className="sdr">
            <span>{STEPS[i]}</span>
            <div className="mb">
              <i style={{ width: `${x}%` }} />
            </div>
            <b>{x}%</b>
          </div>
        ))
      ) : (
        <div className="mk-quiet">{read.state === 'loading' ? copy.loading : copy.noScroll}</div>
      )}
      <XSec a={copy.whereClick} b={copy.heatmap} />
      <Clicks site={site} range={range} page={page} q={q} />
      <XSec a={copy.speed} b={lcp != null ? copy.grades[gradeOf(0, lcp)] : undefined} />
      <div className="mk-quiet">{line}</div>
    </div>
  )
}

export default function PageDetails({ site, range, view }: { site: Site; range: Range; view: ViewState }) {
  const page = pageDetails.use()
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    if (page === null) return
    box.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      pageDetails.set(null)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [page])
  if (page === null) return null
  const close = () => pageDetails.set(null)
  return (
    <MkPortal>
      <div className="xscrim on" onClick={close} aria-hidden="true" />
      <aside ref={box} className="cd on" aria-label={copy.pageDetails} tabIndex={-1}>
        <div className="cdh">
          <b>{copy.pageDetails}</b>
          <span className="mk-quiet">{site.name || site.domain}</span>
          <button type="button" className="ib x" title={copy.close} onClick={close}>
            {'×'}
          </button>
        </div>
        <div className="cdb">
          <Body site={site} range={range} view={view} page={page} />
        </div>
      </aside>
    </MkPortal>
  )
}
