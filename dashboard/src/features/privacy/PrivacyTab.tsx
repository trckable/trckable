// Settings → Data & privacy: the settings, then the privacy report.
import type { Site } from '../../lib/apiMore'
import { PrivacySettings } from '../../views/Privacy'
import { PrivacyReport } from './PrivacyReport'

export { ReportSettings } from '../../views/Privacy'

export function PrivacyTab({ site, onSites }: { site: Site; onSites?: () => void }) {
  return (
    <>
      <PrivacySettings site={site} onSites={onSites} />
      <PrivacyReport site={site} />
    </>
  )
}
