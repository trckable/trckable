// The switcher's foot: Add a site as a quiet row, and on a desktop the keys
// that work in the list.
import { Plus, Settings } from 'lucide-react'
import { copy } from './menuCopy'

/** settings: the current site's settings, here on a narrow phone where the header has no room for the cog. */
export function MenuFoot({ canAdd, onAdd, settings }: { canAdd: boolean; onAdd: () => void; settings?: { label: string; open: () => void } }) {
  return (
    <div className="sites-foot">
      {settings && (
        <button type="button" className="foot-add foot-settings" onClick={settings.open}>
          <Settings size={14} strokeWidth={1.75} aria-hidden="true" />
          {settings.label}
        </button>
      )}
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
        <kbd title={copy.openSiteKey}>{copy.keyOpenSite}</kbd>
        <kbd>{copy.keyClose}</kbd>
      </span>
    </div>
  )
}
