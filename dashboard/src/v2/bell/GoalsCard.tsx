// A day's goals card from the bell: which goals stand out, each goal's times, and the way on to the goal's own page in Explore.
import { Suspense } from 'react'
import { lazyLoad } from '../../lib/lazyLoad'
import type { Site } from '../../lib/api'
import { navigate, readView, setView, writeView } from '../../lib/url'
import { dayOf } from './days'
import type { Notice } from './notices'

const GoalsStory = lazyLoad(() => import('./GoalsStory'))

/** A day's goals card: which goals stand out, each goal's times, and the way on to the goal's own page. */
export function GoalsCard({ n, sites, site, onClose }: { n: Notice; sites: Site[]; site: Site | null; onClose: () => void }) {
  const s = sites.find((x) => (n.siteId ? x.id === n.siteId : x.domain === n.site))
  if (!s || !n.stand) return null
  return (
    <Suspense fallback={null}>
      <GoalsStory
        n={n}
        site={s}
        onClose={onClose}
        onOpen={(goal) => {
          onClose()
          openGoal(s, site, n.stand?.day ?? '', goal)
        }}
      />
    </Suspense>
  )
}

/** Explore's Goals tab over the day, on that goal's page (or the list). */
function openGoal(s: Site, site: Site | null, day: string, goal?: string) {
  const today = dayOf(Date.now() / 1000, s.timezone)
  const patch = { xp: 'goals', xg: goal, xf: [], ...(day && day !== today ? { period: 'custom', from: day, to: day } : { period: 'today' }) }
  if (site?.id === s.id) setView(patch)
  else navigate(`/${encodeURIComponent(s.domain)}${writeView({ ...readView(new URLSearchParams()), ...patch })}`)
}
