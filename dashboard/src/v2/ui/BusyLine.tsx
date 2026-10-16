// One quiet line in the Live card when the site has more people on it than it usually has right now: how many, who they
// are, and "Why?", which opens the busy-moment card (the cause, the numbers, what to do). Nothing shows in a normal hour.
import { useState } from 'react'
import type { Busier } from '../../features/live/api'
import { asSurge, parts, shown } from '../../features/live/busier'
import { copy } from '../../features/live/copy'
import { lazyLoad } from '../../lib/lazyLoad'

const SurgeModal = lazyLoad(() => import('../../features/signals/SurgeModal'))

export function BusyLine({ busier, site, timezone }: { busier: Busier | null; site: string; timezone: string }) {
  const [open, setOpen] = useState(false)
  if (!busier || shown(busier) !== 'busier') return null
  return (
    <>
      <div className="since" style={{ margin: 'var(--mk-s3) 0 0', alignSelf: 'flex-start', maxWidth: '100%' }} role="status">
        <span className="mk-pulse" />
        {copy.busier(busier.now, busier.usual)} · {parts(busier, timezone).join(' · ')} ·{' '}
        <button type="button" className="lk3" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          {copy.why} {'→'}
        </button>
      </div>
      {open && <SurgeModal surge={asSurge(busier)} site={site} tz={timezone} onClose={() => setOpen(false)} onSee={() => setOpen(false)} />}
    </>
  )
}
