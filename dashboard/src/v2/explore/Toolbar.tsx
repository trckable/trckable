// The row under the header: which section, + Filter, Views, and the rest in ⋯; then what is filtered, and the section's
// own tabs. On a phone each menu is a sheet, and Filter and Views fold into the ones that are left.
import type { Filter } from '../../lib/api'
import { XSub } from '../ui/XBits'
import { XIco } from '../ui/XIcons'
import { XMenu } from '../ui/XMenu'
import { copy } from './copy'
import { chipName, dimWord } from './filters'
import { FilterMenu, MoreMenu, PickMenu, ViewsMenu, type ViewsProps } from './menus'
import { FILTER_DIMS, TABS } from './sections'
import type { Connected, FilterDim, Option, Section, Tab } from './types'

export type MenuKey = 'pick' | 'filt' | 'views' | 'more'

export interface ToolbarProps {
  section: Section
  tab: Tab
  filters: Filter[]
  options: Partial<Record<FilterDim, Option[]>>
  conn: Connected
  menu: MenuKey | null
  fd: FilterDim | null
  views: ViewsProps
  details: boolean
  onMenu: (k: MenuKey) => void
  onSection: (s: Section) => void
  onTab: (t: Tab) => void
  onDim: (d: FilterDim | null) => void
  onValue: (d: FilterDim, v: string) => void
  onRemove: (dim: string) => void
  onClear: () => void
  onDetails: () => void
  onCsv: () => void
  onCopy: () => void
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
  const n = p.filters.length
  const btn = (k: MenuKey) => ({ 'aria-haspopup': 'menu' as const, 'aria-expanded': p.menu === k, onClick: () => p.onMenu(k) })
  const tabs = TABS[p.section]
  return (
    <>
      <div className="xtb">
        <span className="xtitle">
          <XIco name={p.section} />
          <b>{name}</b>
        </span>
        <XMenu
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
        </XMenu>
        <XMenu
          id="filt"
          open={p.menu === 'filt'}
          label={copy.filterTitle}
          button={
            <button type="button" className="xb" data-xm="filt" {...btn('filt')}>
              <span className="lb-d">{copy.filter}</span>
              <span className="lb-p">
                {copy.filters}
                {n ? ` (${n})` : ''} <Caret />
              </span>
            </button>
          }
        >
          <FilterMenu filters={p.filters} options={p.options} fd={p.fd} onDim={p.onDim} onValue={p.onValue} />
        </XMenu>
        <XMenu
          id="views"
          open={p.menu === 'views'}
          label={copy.views}
          button={
            <button type="button" className="xb xvb" data-xm="views" {...btn('views')}>
              {copy.views} <Caret />
            </button>
          }
        >
          <ViewsMenu {...p.views} />
        </XMenu>
        <span className="sp" />
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
          <MoreMenu views={p.views} details={p.details} onDetails={p.onDetails} onCsv={p.onCsv} onCopy={p.onCopy} />
        </XMenu>
      </div>
      <Chips p={p} />
      {tabs.length > 1 && <XSub label={name} attr="xtab" value={p.tab} items={tabs.map((t) => ({ key: t, label: copy.sub[t as keyof typeof copy.sub], dot: t === 'search' && !p.conn.search ? copy.notConnected : undefined }))} onPick={p.onTab} />}
    </>
  )
}
