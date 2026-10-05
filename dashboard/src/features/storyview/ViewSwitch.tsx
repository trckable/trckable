// Data's two views: the story of the period, and Explore with all its numbers.
import { defineCopy } from '../../i18n'

const words = defineCopy('storyview.switch', { story: 'Story', explore: 'Explore', label: 'Data view' })

export function ViewSwitch({ story, onPick }: { story: boolean; onPick: (v: 'story' | 'explore') => void }) {
  return (
    <div className="sv-switch" role="group" aria-label={words.label}>
      <button type="button" aria-pressed={story} className={story ? 'on' : ''} onClick={() => onPick('story')}>
        {words.story}
      </button>
      <button type="button" aria-pressed={!story} className={story ? '' : 'on'} onClick={() => onPick('explore')}>
        {words.explore}
      </button>
    </div>
  )
}
