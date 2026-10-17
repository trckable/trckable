import type { LookAlike } from './api'
import { trust } from './trustCopy'

/** The news uses a word an owner is adding for something else: the headlines, and a choice. */
export function LookAlikeNote({ look, onExclude, onOnly, onCancel }: { look: LookAlike; onExclude: () => void; onOnly: () => void; onCancel: () => void }) {
  return (
    <div className="mp-note" role="alert">
      <p>
        <strong>{trust.lookTitle(look.word)}</strong>
      </p>
      <p className="muted">{trust.lookFor}</p>
      <ul>
        {look.examples.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <p className="mp-note-actions">
        {look.suggest_exclude.length > 0 && (
          <button type="button" className="btn primary" onClick={onExclude}>
            {trust.lookAddExclude}: {look.suggest_exclude.join(', ')}
          </button>
        )}
        <button type="button" className="btn" onClick={onOnly}>
          {trust.lookAddOnly}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {trust.lookCancel}
        </button>
      </p>
    </div>
  )
}

/** The news could not be asked: say so, and let the owner add the word anyway. */
export function UncheckedNote({ word, onAdd, onCancel }: { word: string; onAdd: () => void; onCancel: () => void }) {
  return (
    <div className="mp-note" role="alert">
      <p>
        <strong>{trust.uncheckedTitle(word)}</strong>
      </p>
      <p className="mp-note-actions">
        <button type="button" className="btn" onClick={onAdd}>
          {trust.addAnyway}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {trust.lookCancel}
        </button>
      </p>
    </div>
  )
}
