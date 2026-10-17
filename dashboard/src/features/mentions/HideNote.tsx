import type { Hidden } from './api'
import { trust } from './trustCopy'

/** After "Not about us": it is hidden for good, and the words or the site that set it apart can be kept out too. */
export function HideNote({ note, onExclude, onBlock, onUndo, onDone }: { note: Hidden; onExclude: (w: string) => void; onBlock: (host: string) => void; onUndo: () => void; onDone: () => void }) {
  return (
    <div className="card mp-note" role="status">
      <p>{trust.hiddenTitle}</p>
      <p className="mp-note-actions">
        {note.suggest_exclude.slice(0, 3).map((w) => (
          <button key={w} type="button" className="btn" onClick={() => onExclude(w)}>
            {trust.offerExclude(w)}
          </button>
        ))}
        {note.suggest_block && (
          <button type="button" className="btn" onClick={() => onBlock(note.suggest_block)}>
            {trust.offerBlock(note.suggest_block)}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onUndo}>
          {trust.undo}
        </button>
        <button type="button" className="btn ghost" onClick={onDone}>
          {trust.dismiss}
        </button>
      </p>
    </div>
  )
}
