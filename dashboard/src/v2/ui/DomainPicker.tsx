// The domain picker: in the header beside the view switch and the period (the switch never moves), only while the site has been seen on two or more domains. "All domains" (or the one picked)
// opens a compact list (DomainRows); the choice is the page's own filter, so the chip row and this agree. The site menu has no domains.
import { ChevronDown } from 'lucide-react'
import { useCallback, useRef } from 'react'
import { domainCopy as copy } from '../../features/header/domainCopy'
import { useOnlyOpen } from '../../lib/headerMenu'
import { useDomainControl } from '../../lib/domainControl'
import { useTopLayerWhen } from '../../lib/topLayer'
import { DomainRows, domainLabel } from './DomainRows'
import { useMenu } from './useMenu'
import './domainPicker.css'

export function DomainPicker() {
  const c = useDomainControl()
  const { open, attach, close, toggle } = useMenu()
  useOnlyOpen('domains', open, close)
  const menu = useRef<HTMLDivElement>(null)
  useTopLayerWhen(open, menu)
  const done = useCallback(() => close(), [close])
  if (!c || c.seen.length < 2) return null
  const now = domainLabel(c) ?? copy.allDomains
  return (
    <div ref={attach} className="dompick">
      <button type="button" className="dompick-btn" aria-haspopup="menu" aria-expanded={open} aria-label={copy.menuLabel(now)} title={copy.menuLabel(now)} onClick={toggle}>
        <span className="dompick-now">{now}</span>
        <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
      </button>
      <div ref={menu} className={`mk-menu dompick-menu${open ? ' on' : ''}`}>
        {open && <DomainRows c={c} close={done} />}
      </div>
    </div>
  )
}
