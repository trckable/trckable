// Every section of Explore at a glance, from the header on Live and on Explore: a tile each, a tap opens that page.
import { useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { Popover } from '../../kit/Popover'
import { copy } from './copy'
import { openExplore } from './open'
import { groups, TABS, type Section } from './sections'
import { TileIcon } from '../why/tileIcons'

function Tile({ section, onOpen }: { section: Section; onOpen: () => void }) {
  const [on, setOn] = useState(false)
  return (
    <button type="button" className="xtile" data-xtile={section} onClick={onOpen} onPointerEnter={() => setOn(true)} onPointerLeave={() => setOn(false)} onFocus={() => setOn(true)} onBlur={() => setOn(false)}>
      <TileIcon name={section} active={on} />
      <span>{copy.names[section][0]}</span>
    </button>
  )
}

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
            <Tile key={s} section={s} onOpen={() => { close(); openExplore(TABS[s][0]) }} />
          ))}
        </div>
      )}
    </Popover>
  )
}
