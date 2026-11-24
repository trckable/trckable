// The Tracking options pop-up: the same switches as Settings → What the script
// records (views/ScriptRecords.tsx), so there is one list and one set of words.
// The whole file is a lazy chunk (components/FeaturesHost.tsx).
import { SlidersHorizontal } from 'lucide-react'
import { useEffect } from 'react'
import { Modal } from '../../kit/Modal'
import { ModalMark } from '../../kit/ModalMark'
import type { Site } from '../../lib/api'
import { ScriptRecords } from '../../views/ScriptRecords'
import { copy } from './copy'
import { markAllSeen } from './seen'
import './hub.css'

export default function FeaturesDialog({ site, user, onClose }: { site: Site | null; user: string; onClose: () => void }) {
  // Looking at the list is what makes it seen: the menu's dot goes.
  useEffect(() => markAllSeen(user), [user])
  return (
    <Modal label={copy.title} className="feat-modal" onClose={onClose} frame={{ icon: <ModalMark icon={SlidersHorizontal} />, title: copy.title, subtitle: site?.domain, size: 'md', cancel: false }}>
      {site && <ScriptRecords site={site} titled={false} />}
    </Modal>
  )
}
