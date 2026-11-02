// The row under the header: which section, and the rest in ⋯; then what is filtered, and the section's
// own tabs. On a phone each menu is a sheet.
import type { ReactNode } from 'react'
import type { Filter } from '../../lib/api'
import { XSub } from '../ui/XBits'
import { XIco } from '../ui/XIcons'
import { XMenu } from '../ui/XMenu'
import { copy } from './copy'
import { chipName, dimWord } from './filters'
import { MoreMenu, PickMenu, type ViewsProps } from './menus'
import { FILTER_DIMS, TABS } from './sections'
import type { Connected, FilterDim, Option, Section, Tab } from './types'

/** The tabs that read the payments. */
const PAID: Tab[] = ['revmap', 'earners', 'sells', 'buyers', 'vsale', 'toconvert']

export type MenuKey = 'pick' | 'views' | 'more'

interface ToolbarProps {
  period?: ReactNode
  updated?: ReactNode
  noTabs?: boolean
  /** Opens the menu of sections, where it is a drawer: the name is then a heading, not a menu. */
  onDrawer?: () => void
  section: Section
  tab: Tab
  filters: Filter[]
  options: Partial<Record<FilterDim, Option[]>>
  conn: Connected
  menu: MenuKey | null
  views: ViewsProps
  details: boolean
  onMenu: (k: MenuKey) => void
  onSection: (s: Section) => void
  onTab: (t: Tab) => void
  onRemove: (dim: string) => void
  onClear: () => void
  onDetails: () => void
  onCsv: () => void
  onCopy: () => void
  /** Opens the daily email as it will read; absent where the person cannot set it. */
  onMail?: () => void
}

function Caret() {
  return <span className="car">{'▾'}</span>
}

function Chips({ p }: { p: ToolbarProps }) {
  if (!p.filters.length) return null
  const order = (f: Filter) => {
    const i = FILTER_DIMS.indexOf(f.dim as FilterDim)
    return i < 0 ? FILTER_DIMS.length : i
  }
  return (
    <div className="xchips">
      {p.filters.toSorted((a, b) => order(a) - order(b)).map((f) => (
        <span key={f.dim} className="xchip2">
          {dimWord(f.dim)}: {chipName(f, p.options)}
          <button type="button" data-xrm={f.dim} aria-label={copy.removeFilter(dimWord(f.dim))} onClick={() => p.onRemove(f.dim)}>
            {'×'}
          </button>
        </span>
      ))}
      {p.filters.length > 1 && (
        <button type="button" className="xclr" id="xClr" onClick={p.onClear}>
          {copy.clear}
        </button>
      )}
    </div>
  )
}

export function Toolbar(p: ToolbarProps) {
  const name = copy.names[p.section][0]
  const btn = (k: MenuKey) => ({ 'aria-haspopup': 'menu' as const, 'aria-expanded': p.menu === k, onClick: () => p.onMenu(k) })
  const tabs = TABS[p.section]
  return (
    <>
      <div className="xtb">
        {p.onDrawer && (
          <button type="button" className="xb xdrawer-open" aria-label={copy.sections} onClick={p.onDrawer}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
          </button>
        )}
        <span className={`xtitle${p.onDrawer ? ' on-drawer' : ''}`}>
          <XIco name={p.section} />
          <b>{name}</b>
        </span>
        {!p.onDrawer && <XMenu
          id="pick"
          cls="xpw"
          pick
          open={p.menu === 'pick'}
          label={copy.sections}
          button={
            <button type="button" className="xb xpick" data-xm="pick" {...btn('pick')}>
              <XIco name={p.section} />
              <span>{name}</span>
              <Caret />
            </button>
          }
        >
          <PickMenu section={p.section} conn={p.conn} onPick={p.onSection} />
        </XMenu>}
        <span className="sp" />
        {p.updated}
        {p.period && <span className="xperiod">{p.period}</span>}
        <XMenu
          id="more"
          cls="r"
          open={p.menu === 'more'}
          label={copy.more}
          button={
            <button type="button" className="xb xmore" data-xm="more" aria-label={copy.more} {...btn('more')}>
              {'⋯'}
            </button>
          }
        >
          <MoreMenu views={p.views} details={p.details} onDetails={p.onDetails} onCsv={p.onCsv} onCopy={p.onCopy} onMail={p.onMail} />
        </XMenu>
      </div>
      {p.noTabs && <p className="xpage-desc">{copy.names[p.section][1]}</p>}
      <Chips p={p} />
      {!p.noTabs && tabs.length > 1 && <XSub label={name} attr="xtab" value={p.tab} items={tabs.map((t) => ({ key: t, label: copy.sub[t], dot: (t === 'search' && !p.conn.search) || (!p.conn.rev && PAID.includes(t)) ? copy.notConnected : undefined }))} onPick={p.onTab} />}
    </>
  )
}
