// A site that was sending visits and stopped: said on its dashboard, with the
// reason the server found when it last looked. What was recorded before stays
// exactly as it was; the chart simply shows the gap from here.
import { TriangleAlert } from 'lucide-react'
import { stoppedWhy, type Site } from '../lib/api'
import { isViewer } from '../lib/me'
import { openSettings } from '../lib/settings'

const when = (unix: number) =>
  new Date(unix * 1000).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function StoppedNotice({ site }: { site: Site }) {
  if (!site.last_event_at || !site.check) return null
  return (
    <div className="stopped" role="status">
      <span className="stopped-mark" aria-hidden="true">
        <TriangleAlert size={18} strokeWidth={1.75} />
      </span>
      <span className="stopped-text">
        <b>No visits since {when(site.last_event_at)}</b>
        <span>
          When trckable last looked ({when(site.check.at)}), {stoppedWhy(site)}. Stopping deletes nothing: everything recorded before is kept.
        </span>
      </span>
      {!isViewer() && (
        <button type="button" className="btn" onClick={() => openSettings(site, 'install')}>
          Verify now
        </button>
      )}
    </div>
  )
}
