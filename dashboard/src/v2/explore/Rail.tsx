// The list of sections beside the numbers when Explore is full width: every section one tap away, the groups named, and a
// button to fold it down to icons.
import { Fragment } from 'react'
import { XChev, XIco } from '../ui/XIcons'
import { copy } from './copy'
import { GROUPS } from './sections'
import type { Connected, Section } from './types'

export function Rail({ section, conn, folded, onFold, onPick }: { section: Section; conn: Connected; folded: boolean; onFold: () => void; onPick: (s: Section) => void }) {
  const word = folded ? copy.expand : copy.collapse
  return (
    <nav className={`xrail${folded ? ' c' : ''}`} aria-label={copy.railLabel}>
      <button type="button" className="xrc" data-xrc="1" aria-expanded={!folded} aria-label={word + copy.sectionList} title={word} onClick={onFold}>
        <XChev right={folded} />
      </button>
      {GROUPS.map((g) => (
        <Fragment key={g.key}>
          <div className="xgl">{folded ? '' : copy.groups[g.key]}</div>
          {g.items.map((k) => (
            <button key={k} type="button" data-xsec={k} className={`xri${k === section ? ' on' : ''}`} aria-current={k === section ? 'page' : undefined} title={copy.names[k][0]} onClick={() => onPick(k)}>
              <XIco name={k} />
              <span className="nm">{copy.names[k][0]}</span>
              {k === 'sales' && !conn.rev && <span className="xtag">{copy.connectTag}</span>}
            </button>
          ))}
        </Fragment>
      ))}
    </nav>
  )
}
