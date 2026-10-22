// The Tracking options pop-up: the same switches as Settings → What the script
// records (views/ScriptRecords.tsx), so there is one list and one set of words.
// The whole file is a lazy chunk (components/FeaturesHost.tsx).
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { Modal } from '../../kit/Modal'
import type { Site } from '../../lib/api'
import { ScriptRecords } from '../../views/ScriptRecords'
import { copy } from './copy'
import { markAllSeen } from './seen'
import './hub.css'

export default function FeaturesDialog({ site, user, onClose }: { site: Site | null; user: string; onClose: () => void }) {
  // Looking at the list is what makes it seen: the menu's dot goes.
  useEffect(() => markAllSeen(user), [user])
  return (
    <Modal label={copy.title} className="feat-modal" onClose={onClose}>
      <div className="feat-top">
        <h2>{copy.title}</h2>
        {site && <span className="faint">{site.domain}</span>}
        <button type="button" className="modal-close" aria-label={copy.close} title={copy.close} onClick={onClose}>
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div className="feat-body">{site && <ScriptRecords site={site} titled={false} />}</div>
    </Modal>
  )
}
