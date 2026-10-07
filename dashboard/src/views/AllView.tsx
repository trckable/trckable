// Grid | List: two icon buttons next to the sort menu; automatic until one is picked.
import { LayoutGrid, List } from 'lucide-react'
import { copy } from './allSitesCopy'
import type { Layout } from './allSitesLogic'

export function AllView({ value, onChange }: { value: Layout; onChange: (v: Layout) => void }) {
  const items = [
    { key: 'cards', label: copy.viewCards, Icon: LayoutGrid },
    { key: 'list', label: copy.viewList, Icon: List },
  ] as const
  return (
    <div className="all-view" role="group" aria-label={copy.viewLabel}>
      {items.map(({ key, label, Icon }) => (
        <button key={key} type="button" aria-pressed={value === key} aria-label={label} title={label} onClick={() => onChange(key)}>
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
