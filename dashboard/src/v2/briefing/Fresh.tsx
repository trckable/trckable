// A site with no verified install is one setup screen, nothing else: the install on the left, its status beside it. The
// first visit ticks the status, and Live opens by itself.
import type { Site, Visit } from '../../lib/api'
import { SetupScreen } from '../../features/install/SetupScreen'
import { copy as setup } from '../../features/onboarding/copy'
import { copy } from './copy'

export default function Fresh({ site, visits }: { site: Site; visits: Visit[] }) {
  return (
    <div className="mk mk-body mk-fresh">
      <section className="setup-screen" aria-label={copy.freshLabel}>
        <SetupScreen site={site} visits={visits} title={setup.install.title} sub={setup.install.sub(site.domain)} />
      </section>
    </div>
  )
}
