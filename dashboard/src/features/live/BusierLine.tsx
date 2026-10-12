// One quiet line at the top of Live when the site has more people on it than
// it usually has right now, a short line of who they are, and "Why?". The line
// and the button open the busy-moment card, the same one the notification opens.
// Nothing shows while it is a normal hour.
import { useState } from 'react'
import { lazyLoad } from '../../lib/lazyLoad'
import type { Busier } from './api'
import { asSurge, parts, shown } from './busier'
import { copy } from './copy'

const SurgeModal = lazyLoad(() => import('../signals/SurgeModal'))

export function BusierLine({ busier, site, timezone }: { busier: Busier | null; site: string; timezone: string }) {
  const [open, setOpen] = useState(false)
  const state = shown(busier)
  if (!busier || !state) return null
  const line = state === 'busier' ? copy.busier(busier.now, busier.usual) : copy.quieter(busier.now, busier.usual)
  return (
    <div className="live-busier">
      <p className="live-busier-line" role="status">
        <span className="live-busier-head">{line}</span>
        {state === 'busier' && (
          <>
            <button type="button" className="live-busier-why" aria-haspopup="dialog" onClick={() => setOpen(true)}>
              {copy.why} <span aria-hidden="true">→</span>
            </button>
            <button type="button" className="live-busier-parts" aria-haspopup="dialog" onClick={() => setOpen(true)}>
              {parts(busier, timezone).join(' · ')}
            </button>
          </>
        )}
      </p>
      {open && state === 'busier' && <SurgeModal surge={asSurge(busier)} site={site} tz={timezone} onClose={() => setOpen(false)} onSee={() => setOpen(false)} />}
    </div>
  )
}
