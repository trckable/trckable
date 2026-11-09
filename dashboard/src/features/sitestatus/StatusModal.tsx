// A site that stopped, told in full: the report in a centered modal (a bottom sheet on a phone) with its three actions
// in the foot. Esc and a click outside close it, focus is held inside and goes back to where it was (Modal).
import { Modal } from '../../kit/Modal'
import type { Site } from '../../lib/api'
import { can } from '../../lib/permissions'
import { openSettings } from '../../lib/settings'
import { copy } from './copy'
import { StatusPanel } from './StatusCard'
import { statusOf } from './status'
import { when } from './time'
import { useChecks } from './useChecks'
import { useMute } from './useMute'
import './StatusCard.css'

export default function StatusModal({ site, onClose }: { site: Site; onClose: () => void }) {
  const checks = useChecks(site.id)
  const mute = useMute(site, can('alert.manage'))
  const busy = checks.state.phase === 'checking'
  const mutes = mute.have && (
    <span className="status-muted">
      {mute.on ? (
        <>
          {copy.muted(when(mute.until, site.timezone))} · <button type="button" className="linkish" onClick={() => void mute.undo()}>{copy.undo}</button>
        </>
      ) : (
        <button type="button" className="linkish" onClick={() => void mute.mute()}>{copy.mute}</button>
      )}
    </span>
  )
  const actions = (
    <>
      <a className="btn ghost" href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer">
        {copy.open}
      </a>
      {can('alert.manage') && (
        <button type="button" className="btn ghost" onClick={() => openSettings(site, 'install')}>
          {copy.guide}
        </button>
      )}
      <button type="button" className="btn primary" onClick={checks.again} disabled={busy}>
        {copy.again}
      </button>
    </>
  )
  const name = site.name || site.domain
  return (
    <Modal label={name} frame={{ title: name, size: 'lg', cancel: false, extra: mutes || undefined, actions }} className="status-modal" onClose={onClose}>
      <StatusPanel site={site} last={site.last_event_at ?? 0} down={statusOf(site) === 'down'} checks={checks} />
    </Modal>
  )
}
