// What Settings → Alerts shows: the alerts, then the client reports beneath.
import type { Site } from '../../lib/api'
import { AlertsSettings } from '../../views/Alerts'
import { ClientReports } from './ClientReports'

export function AlertsTab({ site }: { site: Site }) {
  return (
    <>
      <AlertsSettings site={site} />
      <ClientReports site={site} />
    </>
  )
}
