// The menus of Explore's toolbar: a button and the list it opens. On a wide screen the list hangs under its button; on a
// phone it is a sheet from the bottom, with a grab bar and a dim behind it.
import { useRef, type ReactNode } from 'react'
import { useTopLayerWhen } from '../../lib/topLayer'

export function XMenu({ id, cls, open, label, button, pick, children }: { id: string; cls?: string; open: boolean; label: string; button: ReactNode; pick?: boolean; children: ReactNode }) {
  const menu = useRef<HTMLDivElement>(null)
  useTopLayerWhen(open, menu)
  return (
    <div className={`xw ${cls ?? ''}`}>
      {button}
      <div ref={menu} className={`mk-menu xm ${pick ? 'xmenu' : ''} ${open ? 'on' : ''}`} id={`xm-${id}`} role="menu" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

export const XGrab = () => <div className="xgrab" aria-hidden="true" />

export const XGl = ({ children }: { children: ReactNode }) => <div className="xgl">{children}</div>

export const XSep = () => <div className="xsep" />

interface XMiProps {
  name: ReactNode
  desc?: string
  icon?: ReactNode
  value?: string
  tag?: string
  on?: boolean
  disabled?: boolean
  back?: boolean
  radio?: boolean
  onClick: () => void
  id?: string
  /** Opens a second list (a filter's values): the right arrow does the same as a tap. */
  enter?: boolean
  /** The hooks the mock gave the line (data-xsec and the like), so a test finds it the same way. */
  data?: Record<string, string>
}

/** One line of a menu: an icon, a name with a hint under it, and on the right a value or a tag. */
export function XMi(p: XMiProps) {
  const cls = `xmi${p.back ? ' back' : ''}${p.on ? ' on' : ''}`
  if (p.back)
    return (
      <button type="button" className={cls} data-back="" data-xfd="" onClick={p.onClick}>
        {p.name}
      </button>
    )
  return (
    <button type="button" className={cls} id={p.id} role={p.radio ? 'menuitemradio' : 'menuitem'} aria-checked={p.radio ? !!p.on : undefined} disabled={p.disabled} data-enter={p.enter || undefined} {...p.data} onClick={p.onClick}>
      {p.icon}
      <span className="mt2">
        <span className="nm">{p.name}</span>
        {p.desc && <span className="d">{p.desc}</span>}
      </span>
      {p.value && <span className="xv">{p.value}</span>}
      {p.tag && <span className="xtag">{p.tag}</span>}
    </button>
  )
}
