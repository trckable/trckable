// One of a site's widgets in Settings → Widgets: a thumbnail, its name, and a
// ⋯ menu to edit, rename, copy its code or delete it.
import { Copy, Pencil, PanelBottomOpen, TextCursorInput, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { fail, type Site, type Widget, more } from '../lib/apiMore'
import { Switch } from '../components/Switch'
import { confirm } from '../components/Confirm'
import { toast } from '../components/Toast'
import { isViewer } from '../lib/me'
import { MAX_NAME, TEXT, cornerCode, frameCode, kindOf, previewUrl, size } from './widgetKinds'
import { WidgetMenu, type WidgetMenuItem } from './WidgetMenu'

const copy = (code: string, said: string) => void navigator.clipboard?.writeText(code).then(() => toast(said))

// The thumbnail is the real preview page, scaled down into a fixed box.
const THUMB = { w: 96, h: 52 }
function Thumb({ site, w, onOpen }: { site: Site; w: Widget; onOpen?: () => void }) {
  const { w: fw, h: fh } = size(w)
  const scale = Math.min(THUMB.w / fw, THUMB.h / fh, 1)
  const at = { left: (THUMB.w - fw * scale) / 2, top: (THUMB.h - fh * scale) / 2, transform: `scale(${scale})` }
  const frame = <iframe src={previewUrl(site.id, w)} width={fw} height={fh} tabIndex={-1} loading="lazy" title={w.name} style={at} />
  if (!onOpen) return <span className={'wg-thumb ' + w.theme}>{frame}</span>
  // The whole thumbnail is the way into the larger preview, where it is edited.
  return (
    <button type="button" className={'wg-thumb ' + w.theme} aria-label={`${TEXT.edit}: ${w.name}`} title={TEXT.edit} onClick={onOpen}>
      {frame}
    </button>
  )
}

export function WidgetRow({ site, w, base, onChange, onEdit }: { site: Site; w: Widget; base: string; onChange: () => void; onEdit: (w: Widget) => void }) {
  const k = kindOf(w.kind)
  const [on, setOn] = useState(w.on)
  const [renaming, setRenaming] = useState(false)
  const cancelled = useRef(false)
  const save = (patch: Partial<Widget>, said?: string) =>
    more
      .updateWidget(site.id, w.id, { ...w, on, ...patch })
      .then(() => {
        if (said) toast(said)
        onChange()
      })
      .catch((e: unknown) => fail(e))
  const toggle = () => {
    setOn(!on)
    more
      .updateWidget(site.id, w.id, { ...w, on: !on })
      .then(() => {
        toast(on ? 'Widget off — its page answers not found' : 'Widget on')
        onChange()
      })
      .catch((e: unknown) => {
        setOn(on)
        fail(e)
      })
  }
  const rename = (name: string) => {
    setRenaming(false)
    if (!cancelled.current && name.trim() !== w.name) void save({ name: name.trim() })
    cancelled.current = false
  }
  const items: WidgetMenuItem[] = [
    { label: TEXT.copyFrame, icon: <Copy size={18} strokeWidth={1.75} aria-hidden="true" />, run: () => copy(frameCode(base, w, site.domain), TEXT.snippet) },
  ]
  if (w.kind === 'online') items.push({ label: TEXT.copyCorner, icon: <PanelBottomOpen size={18} strokeWidth={1.75} aria-hidden="true" />, run: () => copy(cornerCode(base, w), TEXT.script) })
  if (!isViewer()) {
    items.unshift(
      { label: TEXT.edit, icon: <Pencil size={18} strokeWidth={1.75} aria-hidden="true" />, run: () => onEdit(w) },
      { label: TEXT.rename, icon: <TextCursorInput size={18} strokeWidth={1.75} aria-hidden="true" />, run: () => setRenaming(true) },
    )
    items.push({
      label: TEXT.delete,
      icon: <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />,
      run: () =>
        void confirm({
          title: 'Delete this widget?',
          body: 'Within a minute, pages that show it get an empty space where it was. Nothing else changes.',
          confirmLabel: 'Delete',
          danger: true,
          busyLabel: 'Deleting…',
          done: 'Widget deleted',
          run: () => more.deleteWidget(site.id, w.id),
        }).then((ok) => ok && onChange()),
    })
  }
  return (
    <div className="wg-row">
      <Thumb site={site} w={w} onOpen={isViewer() ? undefined : () => onEdit(w)} />
      <span className="wg-row-text">
        {renaming ? (
          <input
            className="wg-name"
            defaultValue={w.name}
            maxLength={MAX_NAME}
            aria-label={TEXT.name}
            autoFocus // the menu item that opened this is the only way here
            onBlur={(e) => rename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                cancelled.current = true
                e.currentTarget.blur()
              }
            }}
          />
        ) : (
          <b className="wg-title">
            <k.Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            {w.name}
          </b>
        )}
        <span className="faint num">
          {[w.theme, ...w.shows].join(' · ')} {TEXT.made} {new Date(w.created_at * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </span>
      </span>
      {!isViewer() && <Switch on={on} label={`${w.name} on`} onChange={toggle} />}
      <WidgetMenu items={items} />
    </div>
  )
}
