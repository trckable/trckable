// A panel for a longer job: a bottom sheet with a grab handle on a phone, a
// centred dialog elsewhere. It is a Modal (focus in and back, Escape, Tab kept
// inside, page behind locked), dressed for the thumb.
import type { ReactNode } from 'react'
import { kitWords } from './copy'
import { Modal } from './Modal'
import './kit.css'

export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal label={label} onClose={onClose} className="kit-sheet">
      <span className="kit-grab" aria-hidden="true" title={kitWords.grab} />
      {children}
    </Modal>
  )
}
