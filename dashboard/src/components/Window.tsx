// One window for Profile and for a site's settings: a head, a menu on the left
// and a body that scrolls. It is the same size and in the same place whichever
// section is open. On a phone it is a sheet of one fixed size; up to five
// sections share a row as equal icon tabs, more of them are a list of
// sections, and the one you pick opens with a way back to the list.
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useState, type ComponentType, type CSSProperties, type ReactNode } from 'react'
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
  listFirst = false,
  children,
}: {
  label: string
  head: ReactNode
  tabs: WindowTab[]
  tab: string
  onTab: (id: string) => void
  onClose: () => void
  /** On a phone, with many sections: start on the list of them, not on a section. */
  listFirst?: boolean
  children: ReactNode
}) {
  const many = tabs.length > 5
  const [view, setView] = useState<'list' | 'detail'>(many && listFirst ? 'list' : 'detail')
  const pick = (id: string) => {
    onTab(id)
    setView('detail')
  }
  const current = tabs.find((t) => t.id === tab)
  const equal = tabs.length > 1 && tabs.length <= 5
  return (
    <Modal label={label} className={'mk-tokens ' + (tabs.length > 1 ? 'window' : 'window single') + (equal ? ' equal' : '') + (many ? ' many view-' + view : '')} keepSize={false} focus="box" onClose={onClose}>
      <header className="window-head">
        {many && view === 'detail' && (
          <button type="button" className="btn icon window-back" aria-label="All sections" onClick={() => setView('list')}>
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
        {head}
        <button type="button" className="btn icon close" aria-label="Close" onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>
      {tabs.length > 1 && (
        <div className="window-menu">
          <div className="window-nav" role="tablist" aria-label={label} style={equal ? ({ '--tabs': tabs.length } as CSSProperties) : undefined}>
            {tabs.map((t, i) => {
              return (
                <div key={t.id} className="window-tab" role="presentation">
                  {t.group !== undefined && t.group !== tabs[i - 1]?.group && (
                    <span className="window-group" aria-hidden="true">
                      {t.group}
                    </span>
                  )}
                  <button type="button" role="tab" aria-label={equal ? t.label : undefined} aria-selected={tab === t.id} aria-current={tab === t.id ? 'true' : undefined} onClick={() => pick(t.id)}>
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
                    <ChevronRight className="window-go" size={16} strokeWidth={1.75} aria-hidden="true" />
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
