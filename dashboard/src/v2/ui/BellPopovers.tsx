// The two popovers of the bell list: a row's ⋯ and the filter.
import { Check, ListFilter, MoreHorizontal } from 'lucide-react'
import { Popover } from '../../kit/Popover'
import { copy } from '../bell/copy'
import type { BellProps, BellRow } from './BellMenu'

/** The ⋯ of a row and what it offers: the kit's popover under the button (a sheet on a phone), over the list, so no row moves. */
export function RowMenu({ row, close }: { row: BellRow; close: () => void }) {
  const actions = row.actions ?? []
  if (actions.length === 0) return null
  return (
    <Popover
      label={copy.more}
      className="nfpop"
      trigger={(t) => (
        <button type="button" className="nfx" aria-label={copy.more} title={copy.more} {...t}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      )}
    >
      {(shut) => (
        <div role="menu">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              className="nfpi"
              onClick={() => {
                shut()
                a.run()
                if (a.key === 'change') close()
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

/** The one filter button: a quiet icon with a dot while the list is narrowed, and the kit's popover (a sheet on a phone) with the kinds and the sites. */
export function FilterMenu({ f }: { f: NonNullable<BellProps['filter']> }) {
  const group = (label: string, items: { id: string; label: string; on: boolean; dot?: boolean; pick: () => void }[], shut: () => void) => (
    <div role="group" aria-label={label} className="nfg">
      <h4>{label}</h4>
      {items.map((o) => (
        <button
          key={o.id}
          type="button"
          role="menuitemradio"
          aria-checked={o.on}
          className="nfpi"
          onClick={() => {
            o.pick()
            shut()
          }}
        >
          <span className="nfpl">{o.label}</span>
          {o.dot && <i className="nfd sm" aria-hidden="true" />}
          {o.on && <Check size={16} aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
  return (
    <Popover
      label={copy.filter}
      className="nfpop"
      trigger={(t) => (
        <button type="button" className="nfq" aria-label={f.active ? `${copy.filter}: ${f.active}` : copy.filter} title={copy.filter} {...t}>
          <ListFilter size={18} aria-hidden="true" />
          {f.active && <i className="nfd sm" aria-hidden="true" />}
        </button>
      )}
    >
      {(shut) => (
        <div role="menu">
          {group(copy.filterLabel, f.groups.map((g) => ({ id: g.id, label: g.label, on: g.on, dot: g.dot, pick: () => f.onGroup(g.id) })), shut)}
          {f.sites && group(copy.siteLabel, f.sites.map((o) => ({ id: o.value || 'all', label: o.label, on: o.on, pick: () => f.onSite(o.value) })), shut)}
        </div>
      )}
    </Popover>
  )
}
