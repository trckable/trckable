// The footer's dot and its few words: is the server there and keeping up (lib/serverStatus.ts), and is
// every site of this account answering (features/sitestatus). It never says "normal" while one fails.
import { Tooltip } from '../kit/Tooltip'
import type { Site } from '../lib/api'
import { statusOf } from '../features/sitestatus/status'
import { useServerStatus } from '../lib/serverStatus'
import { footerMoreCopy as t } from './footerMoreCopy'

export default function ServerStatus({ sites }: { sites: Site[] }) {
  const server = useServerStatus()
  const down = sites.filter((s) => statusOf(s) === 'down')
  const siteDown = server === 'ok' && down.length > 0
  const words = t.status[server]
  const label = siteDown ? t.siteDown(down.map((s) => s.name || s.domain), down.length === 1 ? down[0].down_cause : undefined) : words.label
  return (
    <Tooltip text={siteDown ? t.siteDownTip : words.tip}>
      {(p) => (
        <button type="button" className="footer-status" data-status={siteDown ? 'down' : server} {...p}>
          <i aria-hidden="true" />
          <span>{label}</span>
        </button>
      )}
    </Tooltip>
  )
}
