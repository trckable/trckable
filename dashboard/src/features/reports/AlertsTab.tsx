// What Settings → Alerts shows: the alerts, the uptime check, then the client reports beneath.
import type { Site } from '../../lib/api'
import { AlertsSettings } from '../../views/Alerts'
import { UptimeSetting } from '../sitestatus/UptimeSetting'
import { ClientReports } from './ClientReports'

export function AlertsTab({ site }: { site: Site }) {
  return (
    <>
      <AlertsSettings site={site} />
      <UptimeSetting key={'up' + site.id} site={site} />
      <ClientReports site={site} />
    </>
  )
}
