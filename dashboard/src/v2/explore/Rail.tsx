// The list of sections beside the numbers when Explore is full width: every section one tap away, the groups named.
import { Fragment } from 'react'
import { XIco } from '../ui/XIcons'
import { copy } from './copy'
import { groups } from './sections'
import type { Connected, Section } from './types'

export function Rail({ section, conn, onPick }: { section: Section; conn: Connected; onPick: (s: Section) => void }) {
  return (
    <nav className="xrail" aria-label={copy.railLabel}>
      {groups().map((g) => (
        <Fragment key={g.key}>
          <div className="xgl">{copy.groups[g.key]}</div>
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
