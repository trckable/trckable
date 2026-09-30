// The switcher's foot: Add a site as a quiet row, and on a desktop the keys
// that work in the list.
import { Plus } from 'lucide-react'
import { copy } from './menuCopy'

export function MenuFoot({ canAdd, onAdd }: { canAdd: boolean; onAdd: () => void }) {
  return (
    <div className="sites-foot">
      {canAdd && (
        <button type="button" data-stop className="foot-add" onClick={onAdd}>
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
          {copy.add}
        </button>
      )}
      <span className="foot-keys" aria-hidden="true">
        <span>
          {copy.keyMove.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
        </span>
        <kbd>{copy.keyOpen}</kbd>
        <kbd>{copy.keyClose}</kbd>
      </span>
    </div>
  )
}
