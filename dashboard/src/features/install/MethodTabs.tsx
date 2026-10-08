// The four installs most people need as tabs, and More… for the rest (the
// searchable picker of every method). A method picked from More… becomes a
// fifth tab, so what is shown always has a tab that says so. Arrow keys move
// between tabs, Home and End jump, as the ARIA tabs pattern has it.
import { useEffect, useRef, useState } from 'react'
import { MethodIcon } from '../../components/MethodIcon'
import { Picker } from '../../components/Picker'
import { copy } from './copy'
import { methodOf } from './snippet'
import { isCommon, keyTarget, moreItems, tabsFor } from './tabs'

export const tabId = (id: string) => 'install-tab-' + id
export const panelId = 'install-panel'

export function MethodTabs({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const list = useRef<HTMLDivElement>(null)
  const ids = tabsFor(value)
  // Which edge has tabs scrolled out of sight: it fades, so nothing is ever cut off mid-tab.
  const [more, setMore] = useState<'' | 'start' | 'end' | 'both'>('')
  const measure = () => {
    const el = list.current
    if (!el) return
    const start = el.scrollLeft > 2
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    if (start && end) setMore('both')
    else if (start) setMore('start')
    else setMore(end ? 'end' : '')
  }
  useEffect(() => {
    // The chosen tab (a method picked from More… is the last) comes into view.
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [value])

  const move = (e: React.KeyboardEvent, at: number) => {
    const to = keyTarget(e.key, at, ids.length)
    if (to === null) return
    e.preventDefault()
    const next = ids[to]
    onChange(next)
    list.current?.querySelector<HTMLElement>('#' + tabId(next))?.focus()
  }

  return (
    <div className="inst-tabs-row">
      <div className="inst-tabs" role="tablist" aria-label={copy.tabsLabel} ref={list} data-more={more || undefined} data-n={ids.length} onScroll={measure}>
        {ids.map((id, at) => {
          const on = id === value
          return (
            <button
              key={id}
              id={tabId(id)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={panelId}
              tabIndex={on ? 0 : -1}
              className={on ? 'inst-tab on' : 'inst-tab'}
              onClick={() => onChange(id)}
              onKeyDown={(e) => move(e, at)}
            >
              <MethodIcon id={id} />
              {methodOf(id).name}
            </button>
          )
        })}
      </div>
      <Picker
        label={copy.moreLabel}
        placeholder={copy.moreSearch}
        value={isCommon(value) ? undefined : value}
        onPick={onChange}
        items={moreItems()}
        trigger={() => <span className="inst-more">{copy.more}</span>}
      />
    </div>
  )
}
