// The install of a site that has had no visit, as a whole: where it stands (one card), and under it the compact install
// while there is something to install. Used by the setup screen of an unverified site and by the first run.
import type { ReactNode } from 'react'
import type { Site, Visit } from '../../lib/api'
import { Install } from './Install'
import { journey as t } from './journeyCopy'
import { stageOf } from './journey'
import { SetupStatus } from './SetupStatus'
import { useInstallCheck } from './useInstallCheck'

/** after: anything else under it (the first run's own links). */
export function SetupInstall({ site, visits, after }: { site: Site; visits: Visit[]; after?: ReactNode }) {
  const arrived = visits.length > 0
  const check = useInstallCheck(site.id, arrived, true)
  const stage = stageOf(check.state, arrived)
  const install = <Install site={site} visits={visits} variant="setup" />
  return (
    <div className="setup-flow">
      <SetupStatus site={site} check={check} arrived={arrived} />
      {stage === 'found' && (
        <details className="setup-code">
          <summary>{t.showCode}</summary>
          {install}
        </details>
      )}
      {stage !== 'found' && stage !== 'arrived' && install}
      {after}
    </div>
  )
}

export default SetupInstall
