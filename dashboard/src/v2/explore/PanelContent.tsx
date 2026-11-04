// What is in the open panel: its header, the toolbar, and the section the person is on (with the list of sections beside
// it when it is full width). It owns what the person has chosen (usePanelState) and reads the numbers for it.
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { Site } from '../../lib/api'
import { fmtMoney } from '../../lib/format'
import { addDays, type Range } from '../../lib/dates'
import { queryOf } from '../../lib/dashQuery'
import { EXPLORE_ROWS } from './data/rows'
import { isShared } from '../../lib/me'
import { can } from '../../lib/permissions'
import { openSettings } from '../../lib/settings'
import { setView, type ViewState } from '../../lib/url'
import { say } from '../ui/toast'
import { MailPreview } from './MailPreview'
import { Rail, RailDrawer } from './Rail'
import { PeriodNote, Updated } from './PeriodsLine'
import { SectionPage } from './SectionPage'
import { Toolbar } from './Toolbar'
import { copy } from './copy'
import type { XCtx } from './ctx'
import { useMeta, type DataCtx } from './data/useExplore'
import { nameOf } from './filters'
import { compares, sectionOf } from './sections'
import type { Ask } from './open'
import { useActions } from './useActions'
import { usePanelState } from './usePanelState'
import { useMenuKeys } from './useMenuKeys'

export interface ContentProps {
  site: Site
  range: Range
  view: ViewState
  /** The period in words, for the header ("Today · Fri 16 Oct"). */
  label: string
  /** The period's own chip, with its menu: at full width it stands where the period's words are (the header behind is covered). */
  period?: ReactNode
  /** A line over the section: the site is down. */
  /** Writes an amount in the site's currency; absent where revenue is not shown. */
  money?: (minor: number) => string
  onGoal: () => void
  ask: Ask
  /** Room for the menu beside the numbers; under it the menu is a drawer. */
  full: boolean
}

export default function PanelContent(p: ContentProps) {
  const { tab, filters } = p.ask
  const { s, set, act } = usePanelState(p.ask)
  const c: DataCtx = { site: p.site, range: p.range, view: p.view, filters, money: p.money }
  const { meta, save, drop } = useMeta(c, true)
  const [reads, setReads] = useState(0)
  const section = sectionOf(tab)
  const [drawer, setDrawer] = useState(false)
  const [mail, setMail] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const keys = useMenuKeys(body, s, act.shut)
  const a = useActions({ site: p.site, view: p.view, range: p.range, filters, tab, section })
  const money = p.money ?? ((m: number) => fmtMoney(m, p.site.currency || 'USD', 2, { cents: false }))
  const x: XCtx = {
    site: p.site,
    view: p.view,
    query: { ...queryOf({ ...p.view, filters }, p.range), limit: EXPLORE_ROWS },
    siteName: p.site.name || p.site.domain,
    tabName: copy.sub[tab],
    widen: addDays(p.range.from, 29) > p.range.to ? () => setView({ period: '30d', from: undefined, to: undefined, bucket: undefined, day: undefined }) : undefined,
    filters,
    options: meta.options,
    conn: meta.connected,
    limit: s.n,
    showAll: () => set({ n: 9999 }),
    pick: act.pick,
    pickAny: act.pickAny,
    clearFilters: act.clear,
    goTo: act.tab,
    goWith: act.goWith,
    connect: (k) => (k === 'goals' ? p.onGoal() : openSettings(p.site, k === 'rev' ? 'payments' : 'search')),
    how: (k) => say(copy.howWorks, copy.how[k], { icon: 'i' }),
    money,
    kind: s.kind,
    setKind: (kind) => set({ kind, n: 12 }),
    sdim: s.sdim,
    setSdim: (sdim) => set({ sdim }),
    edit: s.edit,
    setEdit: (edit) => set({ edit }),
    custom: s.custom,
    addCustom: act.addCustom,
    removeCustom: act.removeCustom,
    pageDetails: a.pageDetails,
  }
  // A click in the panel that is not in a menu shuts the menu; one on the dim of a phone's sheet does too.
  const away = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    const menu = t.closest<HTMLElement>('.xm.on')
    if (menu && t === menu && e.clientY < menu.getBoundingClientRect().top) act.shut()
    else if (s.menu && !t.closest('.xw')) act.shut()
  }
  useEffect(() => keys.afterRender())
  const content = (
      <>
        <Toolbar
          period={p.period}
          noTabs
          onDrawer={!p.full ? () => setDrawer(true) : undefined}
          updated={<Updated site={p.site} read={reads} />}
          section={section}
          tab={tab}
          filters={filters}
          options={meta.options}
          conn={meta.connected}
          menu={s.menu}
          details={section === 'pages' && filters.some((f) => f.dim === 'page')}
          views={{
            views: meta.views,
            manage: s.manage,
            canSave: filters.length > 0,
            onApply: (i) => act.apply(meta.views[i].filters),
            onDelete: (i) => {
              drop(i)
              if (meta.views.length <= 1) set({ manage: false })
            },
            onManage: () => set({ manage: !s.manage }),
            onSave: () => {
              save({ name: nameOf(filters, meta.options), filters })
              set({ menu: null })
              say(copy.saved, copy.savedHint)
            },
          }}
          onMenu={(k) => {
            keys.want(s.menu === k ? `out:${k}` : 'in')
            act.menu(k)
          }}
          onSection={(sec) => {
            keys.want('out:pick')
            act.section(sec)
          }}
          onTab={act.tab}
          onRemove={act.remove}
          onClear={act.clear}
          onDetails={() => {
            act.shut()
            a.pageDetails()
          }}
          onCsv={() => {
            act.shut()
            a.csv()
          }}
          onCopy={() => {
            act.shut()
            a.copyLink()
          }}
          onMail={can('note.write') && !isShared() ? () => {
            act.shut()
            setMail(true)
          } : undefined}
        />
        {mail && <MailPreview site={p.site} c={c} onClose={() => setMail(false)} />}
        <PeriodNote site={p.site} view={p.view} range={p.range} compares={compares(tab)} />
        <SectionPage section={section} tab={tab} x={x} c={c} onRead={() => setReads((n) => n + 1)} />
      </>
  )
  return (
    <>
      <div className="xph">
        <b>{copy.title}</b>
        <span className="mk-quiet" id="xpSub">
          {x.siteName}
          {p.full && p.period ? '' : ` · ${p.label}`}
        </span>
      </div>
      {drawer && (
        <RailDrawer onClose={() => setDrawer(false)}>
          <Rail section={section} tab={tab} conn={meta.connected} onPick={(sec) => { setDrawer(false); act.section(sec) }} onTab={(t) => { setDrawer(false); act.tab(t) }} />
        </RailDrawer>
      )}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- one place for the keys of every menu and list below */}
      <div id="xpBody" ref={body} onClick={away} onKeyDown={(e: KeyboardEvent) => keys.onKey(e)}>
        {p.full ? (
          <div className="xlay">
            <Rail section={section} tab={tab} conn={meta.connected} onPick={act.section} onTab={act.tab} />
            <div className="xmain">{content}</div>
          </div>
        ) : (
          content
        )}
      </div>
    </>
  )
}

