// A site with no verified install is one setup screen, nothing else: the compact install (code, AI prompt,
// cookieless) and a live line that looks for the first visit. The visit turns the line green, and Live opens by itself.
import type { Site, Visit } from '../../lib/api'
import { copy as inst } from '../../features/install/copy'
import { SetupInstall } from '../../features/install/SetupInstall'
import { copy } from './copy'

export default function Fresh({ site, visits }: { site: Site; visits: Visit[] }) {
  return (
    <div className="mk mk-body mk-fresh">
      <section className="setup-screen rise" aria-label={copy.freshLabel}>
        <h1 className="setup-title">{inst.titleCard(site.domain)}</h1>
        <SetupInstall site={site} visits={visits} />
      </section>
    </div>
  )
}
