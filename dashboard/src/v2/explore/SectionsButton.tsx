// Every section of Explore at a glance, from the header on Live and on Explore: a tile each, a tap opens that page.
import { LayoutGrid } from 'lucide-react'
import { Popover } from '../../kit/Popover'
import { XIco } from '../ui/XIcons'
import { copy } from './copy'
import { openExplore } from './open'
import { groups, TABS } from './sections'

export function SectionsButton() {
  return (
    <Popover
      label={copy.sections}
      className="lpop xtiles-pop mk-tokens"
      maxHeight={520}
      trigger={(t) => (
        <button {...t} type="button" className="mk-chip xtiles-btn" id="sectionsBtn" title={copy.sections} aria-label={copy.sections}>
          <LayoutGrid size={15} strokeWidth={1.75} aria-hidden={true} />
        </button>
      )}
    >
      {(close) => (
        <div className="xtiles">
          {groups().flatMap((g) => g.items).map((s) => (
            <button key={s} type="button" className="xtile" data-xtile={s} onClick={() => { close(); openExplore(TABS[s][0]) }}>
              <XIco name={s} />
              <span>{copy.names[s][0]}</span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}
