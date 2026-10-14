// The footer's dot and its few words: how the server is doing (lib/serverStatus.ts).
import { Tooltip } from '../kit/Tooltip'
import { useServerStatus } from '../lib/serverStatus'
import { footerMoreCopy } from './footerMoreCopy'

export default function ServerStatus() {
  const status = useServerStatus()
  const words = footerMoreCopy.status[status]
  return (
    <Tooltip text={words.tip}>
      {(tip) => (
        <button type="button" className="footer-status" data-status={status} {...tip}>
          <i aria-hidden="true" />
          <span>{words.label}</span>
        </button>
      )}
    </Tooltip>
  )
}
