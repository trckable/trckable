// The foot of the site list: Add a site, one line. A build may draw it off, with its reason (an account that is read only).
import type { ReactNode } from 'react'
import { useV2Extras } from '../slots'

export interface FootItem {
  key: string
  label: ReactNode
  run: () => void
}

export function MenuFoot({ items, done }: { items: FootItem[]; done: () => void }) {
  const { addSiteGuard } = useV2Extras()
  const draw = (f: FootItem, off: boolean) => (
    <button key={f.key} type="button" data-stop className="mi" disabled={off} onClick={() => { f.run(); done() }}>
      {f.label}
    </button>
  )
  return <div className="mfoot sfoot">{items.map((f) => (addSiteGuard ? <span key={f.key}>{addSiteGuard((off) => draw(f, off))}</span> : draw(f, false)))}</div>
}
