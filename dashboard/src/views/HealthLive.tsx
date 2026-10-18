// The "Live" stamp on Settings → Health: when the numbers were last refreshed, in the app's own 24-hour time.
import { clock } from '../lib/site'

export function HealthLive({ at, err }: { at: Date | null; err: string | null }) {
  return (
    <span className="health-live faint" title="Refreshed every 15 seconds">
      <span className="health-live-dot" aria-hidden="true" />
      {err ? 'Could not refresh' : `Live${at ? ` · ${clock(at, '')}` : ''}`}
    </span>
  )
}
