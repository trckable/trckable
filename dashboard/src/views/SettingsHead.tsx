// A site's settings window head: the site's mark, its name and its domain.
import { SiteMark } from '../components/SiteMark'
import type { Site } from '../lib/api'

export function SettingsHead({ site }: { site: Site }) {
  return (
    <>
      <SiteMark site={site} size={44} />
      <span className="window-who">
        <span className="window-name">
          <b>{site.name || site.domain}</b>
        </span>
        {site.name && site.name !== site.domain && <span className="window-sub">{site.domain}</span>}
      </span>
    </>
  )
}
