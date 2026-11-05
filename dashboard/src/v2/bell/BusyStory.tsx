// A busy notice's story: the surge it tells, with one way on into Explore.
import { Suspense } from 'react'
import { lazyLoad } from '../../lib/lazyLoad'
import { signals } from '../../features/signals/copy'
import type { Surge } from '../../features/signals/surge'
import type { Site } from '../../lib/api'
import { navigate, readView, setView, writeView } from '../../lib/url'
import { whenOf } from './days'
import type { Notice } from './notices'

const SurgeModal = lazyLoad(() => import('../../features/signals/SurgeModal'))

/** A busy notice as the surge the story is told of: its numbers; the rest is read from what was stored (useFullSurge). */
function surgeOf(n: Notice): Surge {
  const { visitors, factor } = n.busy ?? { visitors: 0, factor: 0 }
  return { id: n.id, started: n.at, online: visitors, usual: factor > 0 ? visitors / factor : 0, times: factor, why: { source: n.source, source_dim: n.source ? 'referrer' : undefined, source_value: n.source, source_usual: 0, before: 0, minutes: 0 } }
}

/** A busy row's story, with one way on: Explore on that site, at that time, narrowed to the source that sent them. */
export function BusyStory({ n, sites, site, onClose }: { n: Notice; sites: Site[]; site: Site | null; onClose: () => void }) {
  const s = sites.find((x) => (n.siteId ? x.id === n.siteId : x.domain === n.site))
  if (!s) return null
  const surge = surgeOf(n)
  const go = (patch: Parameters<typeof setView>[0]) => {
    if (site?.id === s.id) setView(patch)
    else navigate(`/${encodeURIComponent(s.domain)}${writeView({ ...readView(new URLSearchParams()), ...patch })}`)
  }
  return (
    <Suspense fallback={null}>
      <SurgeModal surge={surge} site={s.id} tz={s.timezone} head={signals.surge.busyHead(n.site, whenOf(n.at, undefined, s.timezone))} explore={{ filters: n.source ? [{ dim: 'referrer', value: n.source }] : [], go }} onClose={onClose} onSee={() => undefined} />
    </Suspense>
  )
}
