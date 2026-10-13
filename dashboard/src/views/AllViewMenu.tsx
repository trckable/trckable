// The one menu of All sites: period, what to show, which sites and the layout.
// It stays open while you choose, so several things change in one visit; on a
// phone it is the usual bottom sheet. Reset shows when anything is off default.
import { Check, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { Popover } from '../kit'
import type { Site } from '../lib/api'
import type { Lens } from './allLens'
import { copy } from './allSitesCopy'
import { differs, LAYOUTS, PERIOD_DAYS, type Layout, type View } from './allView'
import '../components/sheet.css'

type Props = { view: View; sites: Site[]; money: boolean; change: (c: Partial<View>) => void; reset: () => void }

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="all-view-sec" role="group" aria-label={title}>
      <small aria-hidden="true">{title}</small>
      {children}
    </div>
  )
}

function Choice({ on, role, onClick, children }: { on: boolean; role: 'menuitemradio' | 'menuitemcheckbox'; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role={role} aria-checked={on} onClick={onClick}>
      {children}
      {on && <Check size={14} aria-hidden="true" />}
    </button>
  )
}

export function AllViewMenu({ view, sites, money, change, reset }: Props) {
  const lensLabel: Record<Lens, string> = { visitors: copy.lensVisitors, revenue: copy.lensRevenue }
  const layoutLabel: Record<Layout, string> = { overview: copy.layoutOverview, table: copy.layoutTable }
  const everyone = view.sites.length === 0
  const toggle = (id: string) => {
    const on = new Set(everyone ? sites.map((s) => s.id) : view.sites)
    if (on.has(id)) on.delete(id)
    else on.add(id)
    // The last one stays: a page with no sites is not a choice.
    if (on.size === 0) return
    change({ sites: on.size === sites.length ? [] : sites.filter((s) => on.has(s.id)).map((s) => s.id) })
  }
  // The overview reads the day from the daily series, which a 12 months period (weekly) does not have.
  const days = PERIOD_DAYS.filter((d) => view.layout === 'table' || d < 365)
  return (
    <Popover
      label={copy.viewLabel}
      className="menu all-view"
      maxHeight={640}
      trigger={(p) => (
        <button type="button" className="btn ghost" {...p} aria-haspopup="menu">
          <SlidersHorizontal size={15} aria-hidden="true" />
          {copy.view}
        </button>
      )}
    >
      {() => (
        <div className="menu-list" role="menu" aria-label={copy.viewLabel}>
          <Section title={copy.period}>
            {days.map((d) => (
              <Choice key={d} role="menuitemradio" on={d === view.days} onClick={() => change({ days: d })}>
                {copy.periodLabel(d)}
              </Choice>
            ))}
          </Section>
          {money && (
            <Section title={copy.show}>
              {(['visitors', 'revenue'] as const).map((l) => (
                <Choice key={l} role="menuitemradio" on={l === view.lens} onClick={() => change({ lens: l })}>
                  {lensLabel[l]}
                </Choice>
              ))}
            </Section>
          )}
          {sites.length > 1 && (
            <Section title={copy.sites}>
              <Choice role="menuitemradio" on={everyone} onClick={() => change({ sites: [] })}>
                {copy.allSites}
              </Choice>
              {sites.map((s) => (
                <Choice key={s.id} role="menuitemcheckbox" on={everyone || view.sites.includes(s.id)} onClick={() => toggle(s.id)}>
                  {s.name || s.domain}
                </Choice>
              ))}
            </Section>
          )}
          <Section title={copy.layout}>
            {LAYOUTS.map((l) => (
              <Choice key={l} role="menuitemradio" on={l === view.layout} onClick={() => change({ layout: l })}>
                {layoutLabel[l]}
              </Choice>
            ))}
          </Section>
          {differs(view) && (
            <button type="button" role="menuitem" className="all-view-reset" onClick={reset}>
              {copy.reset}
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}
