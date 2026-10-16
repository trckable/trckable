// Explore's one row of controls: the section (a list grouped in four), what it is narrowed by, the saved views, and
// the rest. Each opens a menu under it (a sheet from the bottom on a phone); the chips of what is on, and the switch
// inside a section, sit under the row. Markup and classes are the walkthrough's own.
import type { ReactNode } from 'react'
import { Ico } from '../ui/icons'
import { GROUPS, TABS, type Section, type Tab } from './sections'
import { copy } from './copy'
import { XSub } from './ui'
import { SectionRow } from './Rail'

export type MenuKey = 'pick' | 'filt' | 'views' | 'more'

export interface ToolbarProps {
  tab: Tab
  section: Section
  menu: MenuKey | null
  onMenu: (m: MenuKey | null) => void
  /** Sections that need something connected first (Sales without revenue). */
  connect: Partial<Record<Section, boolean>>
  onSection: (s: Section) => void
  onTab: (t: Tab) => void
  /** The filters on: label of the dimension, the value as people read it, and how to take it off. */
  chips: { dim: string; label: string; value: string }[]
  onRemove: (dim: string) => void
  onClear: () => void
  /** The filter menu: the dimension being picked from (null at its top), the values of that dimension. */
  dim: string | null
  onDim: (d: string | null) => void
  dims: { id: string; label: string; now: string | null }[]
  values: { value: string; name: string; on: boolean }[]
  onValue: (dim: string, v: string) => void
  views: { name: string }[]
  managing: boolean
  onManage: () => void
  onView: (i: number) => void
  onDeleteView: (i: number) => void
  onSave: () => void
  pageDetails: string | null
  onPageDetails: () => void
  onCsv: () => void
  onLink: () => void
  searchOff: boolean
}

const Item = ({ children, on, ...r }: { children: ReactNode; on?: boolean; onClick: () => void; disabled?: boolean; radio?: boolean; className?: string }) => (
  <button type="button" className={`xmi${on ? ' on' : ''}${r.className ? ` ${r.className}` : ''}`} role={r.radio ? 'menuitemradio' : 'menuitem'} aria-checked={r.radio ? !!on : undefined} disabled={r.disabled} onClick={r.onClick}>
    {children}
  </button>
)

const Grab = () => <div className="xgrab" aria-hidden="true" />

export function Toolbar(p: ToolbarProps) {
  const open = (k: MenuKey) => p.menu === k
  const wrap = (k: MenuKey, btn: ReactNode, menu: ReactNode, cls: string, label: string) => (
    <div className={`xw ${cls}`}>
      {btn}
      <div className={`mk-menu xm${k === 'pick' ? ' xmenu' : ''}${open(k) ? ' on' : ''}`} id={`xm-${k}`} role="menu" aria-label={label}>
        {open(k) && menu}
      </div>
    </div>
  )
  const toggle = (k: MenuKey) => () => p.onMenu(open(k) ? null : k)
  const vrows = p.views.length ? (
    p.views.map((v, i) =>
      p.managing ? (
        <div className="xmr" key={`${v.name}${i}`}>
          <span className="nm">{v.name}</span>
          <button type="button" className="xmx" aria-label={copy.deleteView(v.name)} onClick={() => p.onDeleteView(i)}>
            &times;
          </button>
        </div>
      ) : (
        <Item key={`${v.name}${i}`} onClick={() => p.onView(i)}>
          <span className="mt2">
            <span className="nm">{v.name}</span>
          </span>
        </Item>
      ),
    )
  ) : (
    <div className="xnone">{copy.noViews}</div>
  )
  const vtail = p.managing ? (
    <Item onClick={p.onManage}>
      <span className="mt2">
        <span className="nm">{copy.done}</span>
      </span>
    </Item>
  ) : (
    <>
      <Item onClick={p.onSave} disabled={!p.chips.length}>
        <span className="mt2">
          <span className="nm">{copy.saveView}</span>
          {!p.chips.length && <span className="d">{copy.addFirst}</span>}
        </span>
      </Item>
      {p.views.length > 0 && (
        <Item onClick={p.onManage}>
          <span className="mt2">
            <span className="nm">{copy.manage}</span>
          </span>
        </Item>
      )}
    </>
  )
  const tabs = TABS[p.section]
  return (
    <>
      <div className="xtb">
        <span className="xtitle">
          <Ico name={p.section} className="xi" />
          <b>{copy.names[p.section]}</b>
        </span>
        {wrap(
          'pick',
          <button type="button" className="xb xpick" aria-haspopup="menu" aria-expanded={open('pick')} onClick={toggle('pick')}>
            <Ico name={p.section} className="xi" />
            <span>{copy.names[p.section]}</span>
            <span className="car">{'\u25BE'}</span>
          </button>,
          <>
            <Grab />
            {GROUPS.map((g) => (
              <div key={g.id} style={{ display: 'contents' }}>
                <div className="xgl">{copy.groups[g.id]}</div>
                {g.items.map((s) => (
                  <SectionRow key={s} s={s} on={s === p.section} connect={!!p.connect[s]} onClick={() => p.onSection(s)} />
                ))}
              </div>
            ))}
          </>,
          'xpw',
          copy.sections,
        )}
        {wrap(
          'filt',
          <button type="button" className="xb" aria-haspopup="menu" aria-expanded={open('filt')} onClick={toggle('filt')}>
            <span className="lb-d">{copy.filterDesktop}</span>
            <span className="lb-p">
              {copy.filters(p.chips.length)} <span className="car">{'\u25BE'}</span>
            </span>
          </button>,
          <>
            <Grab />
            {p.dim ? (
              <>
                <Item className="mk-back" onClick={() => p.onDim(null)}>
                  {`‹ ${copy.dims[p.dim as keyof typeof copy.dims]}`}
                </Item>
                {p.values.map((v) => (
                  <Item key={v.value} radio on={v.on} onClick={() => p.onValue(p.dim as string, v.value)}>
                    <span className="mt2">
                      <span className="nm">{v.name}</span>
                    </span>
                  </Item>
                ))}
              </>
            ) : (
              p.dims.map((d) => (
                <Item key={d.id} onClick={() => p.onDim(d.id)}>
                  <span className="mt2">
                    <span className="nm">{d.label}</span>
                  </span>
                  <span className="xv">{d.now ?? copy.any} {'\u203A'}</span>
                </Item>
              ))
            )}
          </>,
          '',
          copy.filter,
        )}
        {wrap(
          'views',
          <button type="button" className="xb xvb" aria-haspopup="menu" aria-expanded={open('views')} onClick={toggle('views')}>
            {copy.views} <span className="car">{'\u25BE'}</span>
          </button>,
          <>
            <Grab />
            {vrows}
            <div className="xsep" />
            {vtail}
          </>,
          '',
          copy.views,
        )}
        <span className="sp" />
        {wrap(
          'more',
          <button type="button" className="xb xmore" aria-haspopup="menu" aria-expanded={open('more')} aria-label={copy.more} onClick={toggle('more')}>
            {'\u22EF'}
          </button>,
          <>
            <Grab />
            <div className="onlyph">
              <div className="xgl">{copy.views}</div>
              {vrows}
              <div className="xsep" />
              {vtail}
              <div className="xsep" />
            </div>
            {p.pageDetails && (
              <Item onClick={p.onPageDetails}>
                <span className="mt2">
                  <span className="nm">{copy.pageDetails}</span>
                  <span className="d">{copy.pageDetailsD}</span>
                </span>
              </Item>
            )}
            <Item onClick={p.onCsv}>
              <span className="mt2">
                <span className="nm">{copy.exportCsv}</span>
                <span className="d">{copy.exportCsvD}</span>
              </span>
            </Item>
            <Item onClick={p.onLink}>
              <span className="mt2">
                <span className="nm">{copy.copyLink}</span>
              </span>
            </Item>
          </>,
          'r',
          copy.more,
        )}
      </div>
      {p.chips.length > 0 && (
        <div className="xchips">
          {p.chips.map((c) => (
            <span key={c.dim} className="xchip2">
              {c.label}: {c.value}
              <button type="button" aria-label={copy.remove(c.label)} onClick={() => p.onRemove(c.dim)}>
                &times;
              </button>
            </span>
          ))}
          {p.chips.length > 1 && (
            <button type="button" className="xclr" onClick={p.onClear}>
              {copy.clear}
            </button>
          )}
        </div>
      )}
      {tabs.length > 1 && <XSub items={tabs.map((t) => ({ id: t, name: copy.sub[t as keyof typeof copy.sub], off: t === 'search' && p.searchOff }))} cur={p.tab} label={copy.names[p.section]} onPick={p.onTab} />}
    </>
  )
}
