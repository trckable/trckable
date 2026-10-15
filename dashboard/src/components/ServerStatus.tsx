// The footer's dot and its few words: is the server there and keeping up (lib/serverStatus.ts), and is
// every site of this account answering (features/sitestatus). It never says "normal" while one fails.
import { Tooltip } from '../kit/Tooltip'
import type { Site } from '../lib/api'
import { quietSites, statusOf } from '../features/sitestatus/status'
import { useServerStatus } from '../lib/serverStatus'
import { footerMoreCopy as t } from './footerMoreCopy'

export default function ServerStatus({ sites }: { sites: Site[] }) {
  const server = useServerStatus()
  const down = sites.filter((s) => statusOf(s) === 'down')
  const siteDown = server === 'ok' && down.length > 0
  const quiet = quietSites(sites)
  const hush = server === 'ok' && !siteDown && quiet.length > 0
  const words = t.status[server]
  let label = words.label
  let tip = words.tip
  let status: string = server
  if (hush) {
    label = t.siteQuiet(quiet.length)
    tip = t.siteQuietTip
    status = 'quiet'
  }
  if (siteDown) {
    label = t.siteDown(down.map((s) => s.name || s.domain), down.length === 1 ? down[0].down_cause : undefined)
    tip = t.siteDownTip
    status = 'down'
  }
  return (
    <Tooltip text={tip}>
      {(p) => (
        <button type="button" className="footer-status" data-status={status} {...p}>
          <i aria-hidden="true" />
          <span>{label}</span>
        </button>
      )}
    </Tooltip>
  )
}
