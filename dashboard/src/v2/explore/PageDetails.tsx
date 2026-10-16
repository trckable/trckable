// What Explore knows about one page, in a sheet over it: how far people read down it and how fast it loads. Opened from
// the ⋯ menu or the note under the pages table, while a page is the filter.
import { useEffect, useRef } from 'react'
import { more, type Site } from '../../lib/apiMore'
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

function Body({ site, range, view, page }: { site: Site; range: Range; view: ViewState; page: string }) {
  const q = { ...queryOf(view, range), compare: undefined, cfrom: undefined, cto: undefined, filters: [{ dim: 'page', value: page }] }
  const key = [site.id, range.from, range.to, page].join('|')
  const read = useLoad(key, (signal) => more.scroll(site.id, q, signal), true)
  const speed = useLoad(`v|${key}`, () => more.vitals(site.id, q), true)
  const reached = read.state === 'ok' && read.data.samples > 0 ? [100, ...read.data.reached.map((x) => (x <= 1 ? Math.round(x * 100) : Math.round(x)))] : null
  const v = speed.state === 'ok' && speed.data.samples > 0 ? speed.data : null
  const lcp = v?.lcp_ms != null ? v.lcp_ms / 1000 : null
  const dash = '\u2013'
  let line: string = copy.noSpeed
  if (speed.state === 'loading') line = copy.loading
  if (v) line = copy.speedLine(lcp != null ? `${fmtFixed(lcp, 1)} s` : dash, v.inp_ms != null ? `${Math.round(v.inp_ms)} ms` : dash, v.cls_1k != null ? fmtFixed(v.cls_1k / 1000, 2) : dash)
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
        <div className="quiet">{read.state === 'loading' ? copy.loading : copy.noScroll}</div>
      )}
      <XSec a={copy.speed} b={lcp != null ? copy.grades[gradeOf(0, lcp)] : undefined} />
      <div className="quiet">{line}</div>
    </div>
  )
}

export function PageDetails({ site, range, view }: { site: Site; range: Range; view: ViewState }) {
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
      <div className="xscrim on" onClick={close} aria-hidden="true" style={{ zIndex: 72 }} />
      <aside ref={box} className="cd on" aria-label={copy.pageDetails} tabIndex={-1} style={{ zIndex: 73 }}>
        <div className="cdh">
          <b>{copy.pageDetails}</b>
          <span className="quiet">{site.name || site.domain}</span>
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
