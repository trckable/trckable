// The footer's dot and its few words: how the server is doing (lib/serverStatus.ts).
import { Tooltip } from '../kit/Tooltip'
import { useServerStatus, type ServerStatus as Status } from '../lib/serverStatus'

const WORDS: Record<Status, { label: string; tip: string }> = {
  ok: { label: 'All systems normal', tip: 'This server answers, and the visits it counts are showing up as they happen.' },
  late: { label: 'Delayed: data arriving late', tip: 'The server is up, but the newest visits take longer than usual to show. They are kept safely and catch up on their own.' },
  down: { label: 'Can’t reach the server', tip: 'This page could not get an answer from the server just now. Check your connection, or the server itself if you run it. It looks again every minute.' },
}

export default function ServerStatus() {
  const status = useServerStatus()
  const words = WORDS[status]
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
