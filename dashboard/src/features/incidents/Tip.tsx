// An explanation kept out of the page: a small (i) beside a figure, open on hover, focus or tap. `word` makes the text itself
// the trigger (a dotted underline) for a name that is explained where it stands ("Quiet").
import { Info } from 'lucide-react'
import { Tooltip } from '../../kit/Tooltip'

export function Tip({ text, word, align = 'left' }: { text: string; word?: string; align?: 'left' | 'right' }) {
  return (
    <Tooltip text={text} align={align}>
      {(p) =>
        word ? (
          <button type="button" className="inc-word" {...p}>
            {word}
          </button>
        ) : (
          <button type="button" className="inc-info" aria-label={text} {...p}>
            <Info size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )
      }
    </Tooltip>
  )
}
