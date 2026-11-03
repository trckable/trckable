// Tech's three leaders: the device, browser and system most people used, a tap filters by it.
import { Cpu, Globe } from 'lucide-react'
import type { ReactNode } from 'react'
import { DeviceIcon } from '../../../components/visitor/DeviceIcon'
import { fmtPct } from '../../../lib/format'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import type { Top } from '../types'

const ICON: Record<Top['dim'], (val: string) => ReactNode> = {
  device: (v) => <DeviceIcon device={v} size={16} />,
  browser: () => <Globe size={16} strokeWidth={1.9} aria-hidden="true" />,
  os: () => <Cpu size={16} strokeWidth={1.9} aria-hidden="true" />,
}

export function TopTiles({ tops, x }: { tops: Top[]; x: XCtx }) {
  return (
    <div className="xkw">
      <div className="kcs xk xtops">
        {tops.map((t) => (
          <button key={t.dim} type="button" className="kc ns xtop" data-top={t.dim} onClick={() => x.pick(t.dim, t.val)}>
            <div className="kt">
              <span className="ki">{ICON[t.dim](t.val)}</span>
              <span className="kl">{copy.top[t.dim]}</span>
            </div>
            <div className="kv">
              {t.val}
              <small>{fmtPct(t.share)}</small>
            </div>
            <div className="kd">{copy.ofVisitors}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
