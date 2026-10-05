// Data's two views: the story of the period, and Explore with all its numbers.
// It sits in the control row's slot (ControlRow), beside the period, so Data
// keeps two header rows; without the slot it stays where it is rendered.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { defineCopy } from '../../i18n'

const words = defineCopy('storyview.switch', { story: 'Story', explore: 'Explore', label: 'Data view' })

export function ViewSwitch({ story, onPick }: { story: boolean; onPick: (v: 'story' | 'explore') => void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setSlot(document.getElementById('sv-slot')), [])
  const el = (
    <div className="sv-switch" role="group" aria-label={words.label}>
      <button type="button" aria-pressed={story} className={story ? 'on' : ''} onClick={() => onPick('story')}>
        {words.story}
      </button>
      <button type="button" aria-pressed={!story} className={story ? '' : 'on'} onClick={() => onPick('explore')}>
        {words.explore}
      </button>
    </div>
  )
  return slot ? createPortal(el, slot) : el
}
