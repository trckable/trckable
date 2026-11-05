// What the toolbar's four menus hold: the sections, the filters (a dimension, then its values), the saved views, and
// the rest (this page's details, the table as a file, a link).
import { Share2 } from 'lucide-react'
import { Fragment } from 'react'
import { XGl, XGrab, XMi, XSep } from '../ui/XMenu'
import { XIco } from '../ui/XIcons'
import { copy as shareCopy } from '../../features/share/copy'
import { copy } from './copy'
import { groups } from './sections'
import { can } from '../../lib/permissions'
import type { Connected, SavedView, Section } from './types'

export function PickMenu({ section, conn, onPick }: { section: Section; conn: Connected; onPick: (s: Section) => void }) {
  return (
    <>
      <XGrab />
      {groups().map((g) => (
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

export function MoreMenu({ views, details, onDetails, onCsv, onCopy, onMail, onShare }: { views: ViewsProps; details: boolean; onDetails: () => void; onCsv: () => void; onCopy: () => void; onMail?: () => void; onShare?: () => void }) {
  return (
    <>
      <XGrab />
      <div>
        <XGl>{copy.views}</XGl>
        <ViewRows {...views} />
        <XSep />
        <ViewTail {...views} />
        <XSep />
      </div>
      {onShare && <XMi data={{ 'data-share': '1' }} icon={<Share2 size={16} strokeWidth={1.75} aria-hidden="true" />} name={shareCopy.menuItem} onClick={onShare} />}
      {details && <XMi data={{ 'data-pgd': '1' }} name={copy.pageDetails} desc={copy.pageDetailsHint} onClick={onDetails} />}
      <XMi id="xCsv" name={copy.exportCsv} desc={copy.exportHint} disabled={!can('data.export')} title={can('data.export') ? undefined : copy.exportDenied} onClick={onCsv} />
      {onMail && <XMi data={{ 'data-mail': '1' }} name={copy.emailPreview} desc={copy.emailPreviewHint} onClick={onMail} />}
      <XMi data={{ 'data-copy': '1' }} name={copy.copyLink} onClick={onCopy} />
    </>
  )
}
