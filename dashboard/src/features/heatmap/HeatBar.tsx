// The overlay's controls, all icons with tooltips: the width (phone, tablet,
// desktop, each with its views), which layers show, and close.
import { ArrowDownToLine, FileImage, Flame, MousePointerClick, Monitor, Smartphone, Tablet, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { WIDTHS, type HeatMap, type Width } from './api'
import { heatCopy } from './copy'
import type { Layers } from './HeatStage'
import { hasViews } from './model'

const WIDTH_ICON: Record<Width, ReactNode> = { 390: <Smartphone size={15} />, 768: <Tablet size={15} />, 1280: <Monitor size={15} /> }
const LAYER_ICON: Record<keyof Layers, ReactNode> = {
  clicks: <MousePointerClick size={15} />,
  scroll: <ArrowDownToLine size={15} />,
  trouble: <TriangleAlert size={15} />,
  page: <FileImage size={15} />,
}

export function HeatBar(p: { map: HeatMap | null; path: string; width: Width | 0; onWidth: (w: Width) => void; layers: Layers; onLayer: (k: keyof Layers) => void; noPage: boolean; demo: boolean; onClose: () => void }) {
  return (
    <div className="heat-bar">
      <Flame size={16} aria-hidden="true" />
      <strong className="heat-title" title={p.path}>{p.path}</strong>
      {p.demo && <span className="tag quiet">{heatCopy.demo}</span>}
      {p.map && <span className="faint num">{heatCopy.views(p.map.views)}</span>}
      <span className="heat-grow" />
      <div className="tabs" role="group" aria-label={heatCopy.width[p.map?.width ?? 1280]}>
        {WIDTHS.map((w) => {
          const views = p.map?.widths.find((x) => x.width === w)?.views ?? 0
          return (
            <button key={w} type="button" aria-pressed={(p.map?.width ?? p.width) === w} disabled={!!p.map && !hasViews(p.map, w)} title={heatCopy.widthTip(heatCopy.width[w], views)} aria-label={heatCopy.width[w]} onClick={() => p.onWidth(w)}>
              {WIDTH_ICON[w]}
            </button>
          )
        })}
      </div>
      <div className="tabs" role="group">
        {(Object.keys(LAYER_ICON) as (keyof Layers)[]).map((k) => (
          <button key={k} type="button" disabled={k === 'page' && p.noPage} aria-pressed={p.layers[k]} title={heatCopy.layers[k]} aria-label={heatCopy.layers[k]} onClick={() => p.onLayer(k)}>
            {LAYER_ICON[k]}
          </button>
        ))}
      </div>
      <button type="button" className="btn ghost icon heat-close" aria-label={heatCopy.close} title={heatCopy.close} onClick={p.onClose}>
        <X size={16} />
      </button>
    </div>
  )
}
