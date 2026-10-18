// The account window's cards for how this browser looks and behaves: appearance (theme, language, the tab's count),
// preferences (Features, installing the app, the sale chime, new versions) and, on a site's page, privacy (own visits).
// What the avatar menu used to hold is here; the ⌘K palette finds each (v2/explore/palette.ts).
import { useState } from 'react'
import { BellRing } from 'lucide-react'
import { SaleLines, TabCountLine } from '../../features/signals/PrefLines'
import { Switch } from '../../components/Switch'
import type { Site } from '../../lib/api'
import { can } from '../../lib/permissions'
import { checksHere, setChecksHere } from '../../lib/update'
import { Line } from '../AccountLine'
import { copy } from './copy'
import { FeaturesLine, InstallLine, LanguageLine, OwnVisitsCard } from './MoreLines'
import { ThemeLine } from './ThemeLine'

export function PrefCards({ user, sites }: { user: string; sites: Site[] }) {
  const [updates, setUpdates] = useState(checksHere())
  return (
    <>
      <section className="card acct-group">
        <h2 className="acct-title">{copy.appearance}</h2>
        <ThemeLine />
        <LanguageLine />
        <TabCountLine />
      </section>

      <section className="card acct-group">
        <h2 className="acct-title">Preferences</h2>
        <FeaturesLine user={user} />
        <InstallLine />
        <SaleLines />
        {/* The check itself is in lib/update.ts: this browser, once a day, nothing about the instance sent. */}
        {can('update.check') && (
          <Line icon={BellRing} label="New versions" hint="Check for new versions">
            <Switch
              on={updates}
              label="New versions"
              onChange={() => {
                setChecksHere(!updates)
                setUpdates(!updates)
              }}
            />
          </Line>
        )}
      </section>

      <OwnVisitsCard sites={sites} />
    </>
  )
}
