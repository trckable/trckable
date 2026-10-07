// One window for Profile and for a site's settings: a head, a menu on the left
// (a row of tabs on a phone) and a body that scrolls. It is the same size and
// in the same place whichever section is open. On a phone it is a sheet of one
// fixed size; up to five sections share the row as equal icon tabs, more of
// them scroll sideways.
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { Modal } from '../kit/Modal'
import './Window.css'

export interface WindowTab {
  id: string
  label: string
  /** The one-word name under the icon in a phone's row of tabs; the label if left out. */
  short?: string
  icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }>
  /** A small mark after the label ("Off"). */
  flag?: ReactNode
  /** A heading over this tab and the ones after it, until the next group. */
  group?: string
}

export function Window({
  label,
  head,
  tabs,
  tab,
  onTab,
  onClose,
  children,
}: {
  label: string
  head: ReactNode
  tabs: WindowTab[]
  tab: string
  onTab: (id: string) => void
  onClose: () => void
  children: ReactNode
}) {
  // On a phone the sections are one row of tabs wider than the screen: the
  // edges fade and an arrow shows on the side that has more, and the open
  // one is scrolled into view.
  const nav = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const measure = () => {
    const el = nav.current
    if (!el) return
    setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }
  useEffect(() => {
    nav.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [tab])
  const nudge = (dir: number) => nav.current?.scrollBy({ left: dir * 160, behavior: 'smooth' })
  const current = tabs.find((t) => t.id === tab)
  const equal = tabs.length > 1 && tabs.length <= 5
  const fade = (more.left ? ' more-left' : '') + (more.right ? ' more-right' : '')
  return (
    <Modal label={label} className={(tabs.length > 1 ? 'window' : 'window single') + (equal ? ' equal' : '')} keepSize={false} focus="box" onClose={onClose}>
      <header className="window-head">
        {head}
        <button type="button" className="btn icon close" aria-label="Close" onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>
      {tabs.length > 1 && (
        <div className="window-menu">
          {more.left && (
            <button type="button" className="window-scroll left" aria-label="Earlier sections" onClick={() => nudge(-1)}>
              <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          {more.right && (
            <button type="button" className="window-scroll right" aria-label="More sections" onClick={() => nudge(1)}>
              <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          <div ref={nav} onScroll={measure} className={'window-nav' + fade} role="tablist" aria-label={label} style={equal ? ({ '--tabs': tabs.length } as CSSProperties) : undefined}>
            {tabs.map((t, i) => {
              return (
                <div key={t.id} className="window-tab" role="presentation">
                  {t.group !== undefined && t.group !== tabs[i - 1]?.group && (
                    <span className="window-group" aria-hidden="true">
                      {t.group}
                    </span>
                  )}
                  <button type="button" role="tab" aria-label={equal ? t.label : undefined} aria-selected={tab === t.id} aria-current={tab === t.id ? 'true' : undefined} onClick={() => onTab(t.id)}>
                    <span className="icon-tile small">
                      <t.icon size={15} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="window-long">{t.label}</span>
                    {equal && (
                      <span className="window-short" aria-hidden="true">
                        {t.short ?? t.label}
                      </span>
                    )}
                    {t.flag}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {/* Focusable, so the section scrolls from the keyboard too — even one,
          like Health, with nothing else in it to tab to. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be focusable to scroll it from the keyboard (WCAG 2.1.1) */}
      <div key={tab} className="window-body" tabIndex={0} role="region" aria-label={current?.label ?? label}>
        {children}
      </div>
    </Modal>
  )
}
