// The page and what is laid over it: the page itself in a frame that runs
// nothing, the scroll map as a gradient, the clicks as glows, and the dead and
// rage clicks as marks. It is drawn at the page's own width and shrunk to fit,
// so every point sits where it did on the page.
import type { HeatMap, Spot } from './api'
import { heatCopy } from './copy'
import { busiest, FIRST_SCREEN, fit, frameSrc, glow, pageSize, place, scrollGradient, strength } from './model'
import { useWidth } from '../../charts/useWidth'

export interface Layers {
  clicks: boolean
  scroll: boolean
  trouble: boolean
  page: boolean
}

function Glows({ spots, w }: { spots: Spot[]; w: number }) {
  const max = busiest(spots)
  return (
    <>
      {spots.map((s, i) => {
        const at = place(s, w)
        return (
          <circle key={i} cx={at.x} cy={at.y} r={glow(s, w)} fill="url(#heat-glow)" opacity={strength(s.n, max)}>
            <title>{`${s.el}: ${s.n}`}</title>
          </circle>
        )
      })}
    </>
  )
}

function Marks({ spots, w, rage }: { spots: Spot[]; w: number; rage?: boolean }) {
  return (
    <>
      {spots.map((s, i) => {
        const at = place(s, w)
        return (
          <g key={i} className={rage ? 'heat-rage' : 'heat-dead'} transform={`translate(${at.x} ${at.y})`}>
            <circle r={rage ? 11 : 9} />
            <path d="M-4 -4L4 4M4 -4L-4 4" />
            <title>{`${s.el}: ${s.n} · ${rage ? heatCopy.rageTip : heatCopy.deadTip}`}</title>
          </g>
        )
      })}
    </>
  )
}

/** The example's page: a block where each element that was clicked sits, so the glows land on something at any width. */
function Sample({ map }: { map: HeatMap }) {
  const blocks = new Map<string, Spot>()
  for (const s of [...map.clicks, ...map.dead, ...map.rage]) if (!blocks.has(s.el)) blocks.set(s.el, s)
  return (
    <div className="heat-sample" aria-hidden="true">
      {[...blocks.values()].map((s) => (
        <i key={s.el} style={{ left: `${s.x / 10}%`, top: s.y, width: `${s.w / 10}%`, height: s.h }} />
      ))}
    </div>
  )
}

export function HeatStage({ map, layers, site, demo }: { map: HeatMap; layers: Layers; site: string; demo: boolean }) {
  const { ref, w: room } = useWidth<HTMLDivElement>(640)
  const { w, h } = pageSize(map)
  const k = fit(room, w)
  return (
    <div ref={ref} className="heat-room">
      <div className="heat-fit" style={{ width: w * k, height: h * k }}>
        <div className="heat-page" style={{ width: w, height: h, transform: `scale(${k})` }}>
          {layers.page && (demo ? <Sample map={map} /> : <iframe className="heat-frame" title={heatCopy.frame} sandbox="allow-same-origin" referrerPolicy="no-referrer" tabIndex={-1} loading="lazy" src={frameSrc(site, map.path)} />)}
          {layers.scroll && <div className="heat-scroll" style={{ backgroundImage: scrollGradient(map.scroll, h, FIRST_SCREEN[map.width]) }} title={heatCopy.layers.scroll} />}
          <svg className="heat-dots" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <defs>
              <radialGradient id="heat-glow">
                <stop offset="0" stopColor="var(--heat)" stopOpacity="0.95" />
                <stop offset="0.5" stopColor="var(--heat)" stopOpacity="0.4" />
                <stop offset="1" stopColor="var(--heat)" stopOpacity="0" />
              </radialGradient>
            </defs>
            {layers.clicks && <Glows spots={map.clicks} w={w} />}
            {layers.trouble && <Marks spots={map.dead} w={w} />}
            {layers.trouble && <Marks spots={map.rage} w={w} rage />}
          </svg>
        </div>
      </div>
    </div>
  )
}
