// The one-time row of keys under the Briefing (j, k, Enter, e, L, B, Esc), with a way to hide it for good.
import { copy } from '../briefing/copy'

export function KeyHint({ onHide }: { onHide: () => void }) {
  return (
    <div className="khint">
      <span>
        <kbd>{'j'}</kbd> <kbd>{'k'}</kbd> {copy.keyCards}
      </span>
      <span>
        <kbd>{'Enter'}</kbd> {copy.keyDetail}
      </span>
      <span>
        <kbd>{'e'}</kbd> {copy.keyExplore}
      </span>
      <span>
        <kbd>{'L'}</kbd> <kbd>{'B'}</kbd> {copy.keyViews}
      </span>
      <span>
        <kbd>{'Esc'}</kbd> {copy.keyClose}
      </span>
      <button type="button" className="gh" data-hint="1" title={copy.keyHide} onClick={onHide}>
        &times;
      </button>
    </div>
  )
}
