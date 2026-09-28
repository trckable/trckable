// The Online now tile in the Data view: a dot that pulses while anyone is on
// the site, and a count that rolls to each new number. Clicking it opens
// Live; a shared page has no Live (and no stream), so there it is just the
// number. Where the number comes from is its title, not a line under it.
import { entryCopy as copy } from './entryCopy'
import { preloadLive } from './liveChunk'
import { switchView } from './switchView'

const warm = () => void preloadLive().catch(() => undefined)

export function OnlineKpi({ online, note, canOpen }: { online: number | null | undefined; note: string; canOpen: boolean }) {
  const body = (
    <>
      <div className="label">
        <span className={online ? 'pulse' : 'pulse off'} aria-hidden="true" />
        {copy.onlineNow}
      </div>
      {/* A new key per number: the new one rolls in from below. */}
      <div className="value num roll-box">
        <span key={online ?? '–'} className="roll">
          {online ?? '–'}
        </span>
      </div>
      <span className="sr">{note}</span>
    </>
  )
  if (!canOpen) return <div className="kpi kpi-online" title={note}>{body}</div>
  return (
    <button type="button" className="kpi kpi-live kpi-online" onClick={() => void switchView(true)} onPointerEnter={warm} onFocus={warm} title={`${copy.openLive} · ${note}`}>
      {body}
    </button>
  )
}
