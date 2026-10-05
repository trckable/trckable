// Over Explore when it was opened from the story: one small chip, first in the
// control row's chips, that names the question it came from and leads back.
// It rides with the host chunk and lands in the row's slot (ControlRow).
import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { bar, fromTitle } from './barCopy'

const noop = () => () => {}

export default function FromStory({ from, onBack }: { from?: string; onBack: () => void }) {
  const slot = useSyncExternalStore(noop, () => document.getElementById('sv-back'), () => null)
  const title = fromTitle(from)
  if (!title || !slot) return null
  return createPortal(
    <button type="button" className="chip from-story" title={bar.back} aria-label={`${bar.back}: ${title}`} onClick={onBack}>
      <span aria-hidden="true">←</span>
      <b>{title}</b>
    </button>,
    slot,
  )
}
