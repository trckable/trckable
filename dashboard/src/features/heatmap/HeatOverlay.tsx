// A page's heatmap: the page in a frame that runs nothing, with where people
// click laid over it, how far down they read, and the clicks that did nothing.
// Counts per element, never a visitor. Lazy: its chunk is fetched when the
// first one is opened. `demo` draws an example with nothing recorded, for the
// card that suggests the module.
import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import { words } from '../../lib/errors'
import { type ReportQuery, type Site } from '../../lib/api'
import { heatApi, type HeatMap, type Width } from './api'
import { heatCopy } from './copy'
import { HeatBar } from './HeatBar'
import { HeatSide } from './HeatSide'
import { HeatStage, type Layers } from './HeatStage'
import { exampleHeat, isRisky } from './model'
import './heatmap.css'

const SHOWN: Layers = { clicks: true, scroll: false, trouble: true, page: true }


export default function HeatOverlay({ site, path, query, demo = false, onClose }: { site: Site; path: string; query: ReportQuery; demo?: boolean; onClose: () => void }) {
  const [width, setWidth] = useState<Width | 0>(0)
  const [layers, setLayers] = useState<Layers>({ ...SHOWN, page: !isRisky(path) }) // a sign-out page is not opened to look at it
  const [got, setGot] = useState<{ key: string; map: HeatMap } | null>(null)
  const [err, setErr] = useState<{ key: string; text: string } | null>(null)
  const key = JSON.stringify([site.id, path, query.from, query.to, width])
  useEffect(() => {
    if (demo) return
    const ac = new AbortController()
    heatApi
      .map(site.id, query, path, width, ac.signal)
      .then((map) => setGot({ key, map }))
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setErr({ key, text: words(e) })
      })
    return () => ac.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- key is the site, page, period and width; query is a new object each render
  const example = useMemo(() => (demo ? exampleHeat(width || 1280) : null), [demo, width])
  const read = got?.key === key ? got.map : null
  const map = demo ? example : read
  const failed = err?.key === key ? err.text : ''
  const empty = !!map && map.views === 0 && map.clicks.length === 0
  return (
    <Modal label={heatCopy.open(path)} className="heat" keepSize={false} onClose={onClose}>
      <HeatBar map={map} path={path} width={width} onWidth={setWidth} layers={layers} onLayer={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} noPage={isRisky(path)} demo={demo} onClose={onClose} />
      {failed && <div className="empty">{failed}</div>}
      {!map && !failed && <div className="empty">{heatCopy.loading}</div>}
      {empty && <div className="empty">{width ? heatCopy.noneWidth : heatCopy.none}</div>}
      {map && !empty && (
        <div className="heat-body">
          <HeatStage map={map} layers={layers} site={site.id} demo={demo} />
          <HeatSide map={map} />
        </div>
      )}
    </Modal>
  )
}
