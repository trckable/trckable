// Explore's section list as a rail beside the table (at full width), and the row that names one section in it and in
// the picker. Markup and classes are the walkthrough's own.
import { Ico } from '../ui/icons'
import { GROUPS, type Section } from './sections'
import { copy } from './copy'

export function SectionRow({ s, on, connect, onClick, rail }: { s: Section; on: boolean; connect: boolean; onClick: () => void; rail?: boolean }) {
  return (
    <button type="button" className={`${rail ? 'xri' : 'xmi'}${on ? ' on' : ''}`} role={rail ? undefined : 'menuitem'} aria-current={rail && on ? 'page' : undefined} title={rail ? copy.names[s] : undefined} onClick={onClick}>
      <Ico name={s} className="xi" />
      {rail ? (
        <span className="nm">{copy.names[s]}</span>
      ) : (
        <span className="mt2">
          <span className="nm">{copy.names[s]}</span>
          <span className="d">{copy.descs[s]}</span>
        </span>
      )}
      {connect && <span className="xtag">{copy.connect}</span>}
    </button>
  )
}

export function Rail({ section, collapsed, connect, onSection, onToggle }: { section: Section; collapsed: boolean; connect: Partial<Record<Section, boolean>>; onSection: (s: Section) => void; onToggle: () => void }) {
  return (
    <nav className={`xrail${collapsed ? ' c' : ''}`} aria-label={copy.sections}>
      <button type="button" className="xrc" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand the section list' : 'Collapse the section list'} title={collapsed ? 'Expand' : 'Collapse'} onClick={onToggle}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={collapsed ? 'M6 3.5 10.5 8 6 12.5' : 'M10 3.5 5.5 8l4.5 4.5'} />
        </svg>
      </button>
      {GROUPS.map((g) => (
        <div key={g.id} style={{ display: 'contents' }}>
          <div className="xgl">{collapsed ? '' : copy.groups[g.id]}</div>
          {g.items.map((s) => (
            <SectionRow key={s} s={s} rail on={s === section} connect={!!connect[s]} onClick={() => onSection(s)} />
          ))}
        </div>
      ))}
    </nav>
  )
}
