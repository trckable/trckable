// What the toolbar's four menus hold: the sections, the filters (a dimension, then its values), the saved views, and
// the rest (this page's details, the table as a file, a link).
import { Fragment } from 'react'
import { XGl, XGrab, XMi, XSep } from '../ui/XMenu'
import { XIco } from '../ui/XIcons'
import { copy } from './copy'
import { chipName, dimWord, valueOf } from './filters'
import { FILTER_DIMS, GROUPS } from './sections'
import type { Filter } from '../../lib/api'
import type { Connected, FilterDim, Option, SavedView, Section } from './types'

export function PickMenu({ section, conn, onPick }: { section: Section; conn: Connected; onPick: (s: Section) => void }) {
  return (
    <>
      <XGrab />
      {GROUPS.map((g) => (
        <Fragment key={g.key}>
          <XGl>{copy.groups[g.key]}</XGl>
          {g.items.map((k) => (
            <XMi key={k} data={{ 'data-xsec': k }} icon={<XIco name={k} />} name={copy.names[k][0]} desc={copy.names[k][1]} on={k === section} tag={k === 'sales' && !conn.rev ? copy.connectTag : undefined} onClick={() => onPick(k)} />
          ))}
        </Fragment>
      ))}
    </>
  )
}

export function FilterMenu({ filters, options, fd, onDim, onValue }: { filters: Filter[]; options: Partial<Record<FilterDim, Option[]>>; fd: FilterDim | null; onDim: (d: FilterDim | null) => void; onValue: (d: FilterDim, v: string) => void }) {
  if (fd) {
    const now = valueOf(filters, fd)
    return (
      <>
        <XGrab />
        <XMi back name={`‹ ${dimWord(fd)}`} onClick={() => onDim(null)} />
        {(options[fd] ?? []).map((o) => (
          <XMi key={o.val} data={{ 'data-xfv': o.val }} radio on={now === o.val} name={o.name} onClick={() => onValue(fd, o.val)} />
        ))}
      </>
    )
  }
  return (
    <>
      <XGrab />
      {FILTER_DIMS.map((d) => {
        const v = valueOf(filters, d)
        return <XMi key={d} enter data={{ 'data-xfd': d }} name={dimWord(d)} value={`${v !== null ? chipName({ dim: d, value: v }, options) : copy.any} ›`} onClick={() => onDim(d)} />
      })}
    </>
  )
}

export interface ViewsProps {
  views: SavedView[]
  manage: boolean
  canSave: boolean
  onApply: (i: number) => void
  onDelete: (i: number) => void
  onManage: () => void
  onSave: () => void
}

function ViewRows(p: ViewsProps) {
  if (!p.views.length) return <div className="xnone">{copy.noViews}</div>
  return (
    <>
      {p.views.map((v, i) =>
        p.manage ? (
          <div key={v.name} className="xmr">
            <span className="nm">{v.name}</span>
            <button type="button" className="xmx" data-xvdel={i} aria-label={copy.deleteView(v.name)} onClick={() => p.onDelete(i)}>
              {'×'}
            </button>
          </div>
        ) : (
          <XMi key={v.name} data={{ 'data-xseg': String(i) }} name={v.name} onClick={() => p.onApply(i)} />
        ),
      )}
    </>
  )
}

function ViewTail(p: ViewsProps) {
  if (p.manage) return <XMi data={{ 'data-xmanage': '1' }} name={copy.done} onClick={p.onManage} />
  return (
    <>
      <XMi id="xSave" name={copy.saveView} desc={p.canSave ? undefined : copy.needFilter} disabled={!p.canSave} onClick={p.onSave} />
      {p.views.length > 0 && <XMi data={{ 'data-xmanage': '1' }} name={copy.manage} onClick={p.onManage} />}
    </>
  )
}

export function ViewsMenu(p: ViewsProps) {
  return (
    <>
      <XGrab />
      <ViewRows {...p} />
      <XSep />
      <ViewTail {...p} />
    </>
  )
}

export function MoreMenu({ views, details, onDetails, onCsv, onCopy }: { views: ViewsProps; details: boolean; onDetails: () => void; onCsv: () => void; onCopy: () => void }) {
  return (
    <>
      <XGrab />
      <div className="onlyph">
        <XGl>{copy.views}</XGl>
        <ViewRows {...views} />
        <XSep />
        <ViewTail {...views} />
        <XSep />
      </div>
      {details && <XMi data={{ 'data-pgd': '1' }} name={copy.pageDetails} desc={copy.pageDetailsHint} onClick={onDetails} />}
      <XMi id="xCsv" name={copy.exportCsv} desc={copy.exportHint} onClick={onCsv} />
      <XMi data={{ 'data-copy': '1' }} name={copy.copyLink} onClick={onCopy} />
    </>
  )
}
