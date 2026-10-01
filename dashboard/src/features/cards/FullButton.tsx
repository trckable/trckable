// The quiet way into Full (its own chunk, with its own styles: Compact's first load carries neither) from Compact: a small button at the end of the
// first card's tabs. Its tooltip says what Full adds; the key is in the button.
import { Maximize2 } from 'lucide-react'
import { caps, keyFor } from '../../lib/keys'
import { cardCopy } from './copy'
import './FullButton.css'

export default function FullButton({ onFull }: { onFull: () => void }) {
  return (
    <button type="button" className="tc-full" data-tip={cardCopy.fullTip} aria-label={cardCopy.fullLabel} onClick={onFull}>
      <Maximize2 size={13} strokeWidth={1.75} aria-hidden="true" />
      {cardCopy.full}
      <span className="kbd">{caps(keyFor('mode')).join('')}</span>
    </button>
  )
}
