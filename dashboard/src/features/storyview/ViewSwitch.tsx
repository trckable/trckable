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
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h16M4 14h10M4 18h7" /></svg>
        <span className="sv-word">{words.story}</span>
      </button>
      <button type="button" aria-pressed={!story} className={story ? '' : 'on'} onClick={() => onPick('explore')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V12M10 20V5M15 20v-9M20 20V8" /></svg>
        <span className="sv-word">{words.explore}</span>
      </button>
    </div>
  )
  return slot ? createPortal(el, slot) : el
}
