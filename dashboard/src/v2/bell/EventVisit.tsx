// The visit behind a goal or a signup: who (their face and name, a tap opens their story), where from, the page and the way in.
import { lazy, Suspense, useMemo, useState } from 'react'
import { Avatar } from '../../components/visitor/Avatar'
import { Loading } from '../../components/loading/Loading'
import { Place, Tech } from '../../features/journey/IdentityCard'
import { SourceChip } from '../../features/journey/SourceChip'
import { useJourney } from '../../features/journey/useJourney'
import type { Site } from '../../lib/api'
import { nameOf } from '../../lib/visitor'
import { dayOf } from './days'
import { eventCopy as t } from './eventCopy'
import { trailTo, visitAt } from './eventModel'
import type { Notice } from './notices'

const JourneyDialog = lazy(() => import('../../features/journey/JourneyDialog').then((m) => ({ default: m.JourneyDialog })))

const DAY = 86400

function Visit({ n, site, visitor }: { n: Notice; site: Site; visitor: string }) {
  const at = n.exact ?? n.at
  const [open, setOpen] = useState(false)
  const query = useMemo(() => ({ from: dayOf(at - DAY, site.timezone), to: dayOf(at + DAY, site.timezone) }), [at, site.timezone])
  const state = useJourney(site.id, visitor, query)
  if (state.status === 'loading') return <Loading height={120} label={t.loading} />
  if (state.status === 'failed') return <p className="ev-note" role="alert">{t.failed}</p>
  const v = visitAt(state.story, at)
  if (!v) return <p className="ev-note">{t.noVisit}</p>
  const trail = trailTo(v, at)
  const who = { ...state.story.identity, country: v.country, device: v.device, browser: v.browser, os: v.os }
  return (
    <>
      <button type="button" className="ev-who" aria-label={`${t.openVisitor}: ${nameOf(visitor)}`} onClick={() => setOpen(true)}>
        <Avatar id={visitor} size={44} />
        <span className="ev-who-text">
          <span className="ev-name">{nameOf(visitor)}</span>
          <span className="ev-meta">
            <Place who={who} />
            <Tech who={who} />
          </span>
        </span>
      </button>
      <dl className="ev-facts">
        {trail.page && (
          <>
            <dt>{t.page}</dt>
            <dd>
              <code>{trail.page}</code>
            </dd>
          </>
        )}
        <dt>{t.from}</dt>
        <dd>
          <SourceChip channel={v.channel} referrer={v.referrer} />
        </dd>
      </dl>
      {trail.before.length > 0 && (
        <div>
          <p className="ev-note">{t.path}</p>
          <ol className="ev-path" aria-label={t.path}>
            {[...trail.before, trail.page].map((p, i) => (
              <li key={i}>
                <code title={p}>{p}</code>
              </li>
            ))}
          </ol>
        </div>
      )}
      {open && (
        <Suspense fallback={null}>
          <JourneyDialog site={site} visitor={visitor} query={query} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}

/** A goal's or a signup's visit; the visit is not told where the site keeps visitors apart by no one (cookieless) or the server gave none. */
export function EventVisit({ n, site }: { n: Notice; site: Site }) {
  if (!n.visitor || site.cookieless) return <p className="ev-note">{t.noVisit}</p>
  return <Visit n={n} site={site} visitor={n.visitor} />
}
