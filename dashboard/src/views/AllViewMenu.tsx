// The View menu of All sites: what to show, the layout and which sites. The
// period is not in here: it sits beside it in the head (AllPeriod). It stays
// open while you choose, so several things change in one visit; on a phone it
// is the usual bottom sheet. Reset shows when anything is off default.
import { SiteMark } from '../components/SiteMark'
import { LayoutList, SlidersHorizontal, Table2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Popover, Segmented } from '../kit'
import type { Site } from '../lib/api'
import { copy as incidents } from '../features/incidents/copy'
import { copy } from './allSitesCopy'
import { hasLayout, LAYOUTS, menuDiffers, type Layout, type View, type ViewLens } from './allView'
import '../components/sheet.css'

type Props = { view: View; sites: Site[]; money: boolean; change: (c: Partial<View>) => void; reset: () => void }

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="all-view-sec" role="group" aria-label={title}>
      <div className="all-view-head">
        <small aria-hidden="true">{title}</small>
        {aside}
      </div>
      {children}
    </div>
  )
}

const LAYOUT_ICON = { overview: LayoutList, table: Table2 }

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
  // None leaves the first site: a page with no sites is not a choice.
  const allOrNone = () => change({ sites: everyone ? [sites[0].id] : [] })
  const lenses: ViewLens[] = money ? ['visitors', 'revenue', 'uptime'] : ['visitors', 'uptime']
  return (
    <Popover
      label={copy.viewLabel}
      className="menu all-view"
      maxHeight={640}
      trigger={(p) => (
        <button type="button" className="btn" {...p} aria-haspopup="dialog">
          <SlidersHorizontal size={15} aria-hidden="true" />
          {copy.view}
          {menuDiffers(view) && <span className="all-view-dot" aria-hidden="true" />}
        </button>
      )}
    >
      {() => (
        <div className="all-view-body">
          <Section title={copy.show}>
            <Segmented label={copy.show} value={view.lens} onChange={(lens) => change({ lens })} options={lenses.map((l) => ({ value: l, label: lensLabel[l] }))} />
          </Section>
          {hasLayout(view) && (
            <Section title={copy.layout}>
              <Segmented
                label={copy.layout}
                value={view.layout}
                onChange={(layout) => change({ layout })}
                options={LAYOUTS.map((l) => {
                  const Icon = LAYOUT_ICON[l]
                  return {
                    value: l,
                    label: (
                      <>
                        <Icon size={14} aria-hidden="true" />
                        {layoutLabel[l]}
                      </>
                    ),
                  }
                })}
              />
            </Section>
          )}
          {sites.length > 1 && (
            <Section
              title={copy.sites}
              aside={
                <button type="button" className="all-view-link" data-nav onClick={allOrNone}>
                  {everyone ? copy.none : copy.all}
                </button>
              }
            >
              <div className="all-view-sites">
                {sites.map((s) => (
                  <label key={s.id} className="all-view-site">
                    <input type="checkbox" data-nav checked={everyone || view.sites.includes(s.id)} onChange={() => toggle(s.id)} />
                    <SiteMark site={s} size={16} />
                    <span>{s.name || s.domain}</span>
                  </label>
                ))}
              </div>
            </Section>
          )}
          {menuDiffers(view) && (
            <button type="button" className="all-view-reset" data-nav onClick={reset}>
              {copy.reset}
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}
