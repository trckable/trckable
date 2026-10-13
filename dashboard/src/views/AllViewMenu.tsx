// The one menu of All sites: period, what to show, which sites and the layout.
// It stays open while you choose, so several things change in one visit; on a
// phone it is the usual bottom sheet. Reset shows when anything is off default.
import { Check, SlidersHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Popover } from '../kit'
import type { Site } from '../lib/api'
import { copy as incidents } from '../features/incidents/copy'
import { copy } from './allSitesCopy'
import { differs, LAYOUTS, PERIOD_DAYS, type Layout, type View, type ViewLens } from './allView'
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

const FIRST_SITES = 5

/** The first few sites; the rest behind "Show all", open from the start when one of them is picked. */
function SiteChoices({ sites, view, everyone, toggle }: { sites: Site[]; view: View; everyone: boolean; toggle: (id: string) => void }) {
  const hidden = sites.slice(FIRST_SITES)
  const [all, setAll] = useState(() => hidden.some((s) => view.sites.includes(s.id)))
  const shown = all ? sites : sites.slice(0, FIRST_SITES)
  return (
    <>
      {shown.map((s) => (
        <Choice key={s.id} role="menuitemcheckbox" on={everyone || view.sites.includes(s.id)} onClick={() => toggle(s.id)}>
          {s.name || s.domain}
        </Choice>
      ))}
      {hidden.length > 0 && (
        <button type="button" role="menuitem" className="all-view-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? copy.showFewer : copy.showAll(sites.length)}
        </button>
      )}
    </>
  )
}

export function AllViewMenu({ view, sites, money, change, reset }: Props) {
  const lensLabel: Record<ViewLens, string> = { visitors: copy.lensVisitors, revenue: copy.lensRevenue, uptime: incidents.lensUptime }
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
  // The overview reads the day from the daily series, which a 12 months period (weekly) does not have; Uptime does not.
  const days = PERIOD_DAYS.filter((d) => view.layout === 'table' || view.lens === 'uptime' || d < 365)
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
          <Section title={copy.show}>
            {(money ? (['visitors', 'revenue', 'uptime'] as const) : (['visitors', 'uptime'] as const)).map((l) => (
              <Choice key={l} role="menuitemradio" on={l === view.lens} onClick={() => change({ lens: l })}>
                {lensLabel[l]}
              </Choice>
            ))}
          </Section>
          {sites.length > 1 && (
            <Section title={copy.sites}>
              <Choice role="menuitemradio" on={everyone} onClick={() => change({ sites: [] })}>
                {copy.allSites}
              </Choice>
              <SiteChoices sites={sites} view={view} everyone={everyone} toggle={toggle} />
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
