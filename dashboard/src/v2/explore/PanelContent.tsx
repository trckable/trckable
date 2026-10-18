// What is in the open panel: its header, the toolbar, and the section the person is on (with the list of sections beside
// it when it is full width). It owns what the person has chosen (usePanelState) and reads the numbers for it.
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { Site } from '../../lib/api'
import { fmtMoney } from '../../lib/format'
import { addDays, type Range } from '../../lib/dates'
import { queryOf } from '../../lib/dashQuery'
import { EXPLORE_ROWS } from './data/rows'
import { openSettings } from '../../lib/settings'
import { setView, type ViewState } from '../../lib/url'
import { say } from '../ui/toast'
import { FullButton } from './FullButton'
import { Rail } from './Rail'
import { SectionBody } from './SectionBody'
import { Toolbar } from './Toolbar'
import { copy } from './copy'
import type { XCtx } from './ctx'
import { useMeta, useTab, type DataCtx } from './data/useExplore'
import { nameOf } from './filters'
import { sectionOf } from './sections'
import type { Ask } from './open'
import { useActions } from './useActions'
import { usePanelState } from './usePanelState'
import { useMenuKeys } from './useMenuKeys'
import { firstFocusable } from './usePanelKeys'

export interface ContentProps {
  site: Site
  range: Range
  view: ViewState
  /** The period in words, for the header ("Today · Fri 16 Oct"). */
  label: string
  /** The period's own chip, with its menu: at full width it stands where the period's words are (the header behind is covered). */
  period?: ReactNode
  /** Writes an amount in the site's currency; absent where revenue is not shown. */
  money?: (minor: number) => string
  onGoal: () => void
  ask: Ask
  full: boolean
  onFull: () => void
  close: () => void
}

export default function PanelContent(p: ContentProps) {
  const { tab, filters } = p.ask
  const { s, set, act } = usePanelState(p.ask)
  const c: DataCtx = { site: p.site, range: p.range, view: p.view, filters, money: p.money }
  const { meta, save, drop } = useMeta(c, true)
  const loaded = useTab(tab, c, true)
  const section = sectionOf(tab)
  const body = useRef<HTMLDivElement>(null)
  const keys = useMenuKeys(body, s, act.shut)
  const a = useActions({ site: p.site, view: p.view, range: p.range, filters, tab, section })
  const money = p.money ?? ((m: number) => fmtMoney(m, p.site.currency || 'USD', 2, { cents: false }))
  const x: XCtx = {
    site: p.site,
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
    clearFilters: act.clear,
    goTo: act.tab,
    connect: (k) => (k === 'goals' ? p.onGoal() : openSettings(p.site, k === 'rev' ? 'payments' : 'search')),
    how: (k) => say(copy.howWorks, copy.how[k], { icon: 'i' }),
    money,
    kind: s.kind,
    setKind: (kind) => set({ kind, n: 12 }),
    sdim: s.sdim,
    setSdim: (sdim) => set({ sdim }),
    edit: s.edit,
    setEdit: (edit) => set({ edit }),
    addAs: s.addAs,
    setAddAs: (addAs) => set({ addAs }),
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
  // The panel's own parts load after it opens: focus moves into it once they are here.
  useEffect(() => {
    const el = document.getElementById('xp')
    if (el && (document.activeElement === el || !el.contains(document.activeElement))) firstFocusable(el)?.focus({ preventScroll: true })
  }, [])
  const content = (
      <>
        <Toolbar
          section={section}
          tab={tab}
          filters={filters}
          options={meta.options}
          conn={meta.connected}
          menu={s.menu}
          fd={s.fd}
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
          onDim={(d) => {
            keys.want('in')
            set({ fd: d })
          }}
          onValue={(d, v) => {
            keys.want('out:filt')
            act.setFilter(d, v)
          }}
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
        />
        <SectionBody tab={tab} x={x} r={loaded} />
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
        {p.full && p.period}
        <FullButton full={p.full} onClick={p.onFull} />
        <button type="button" className="ib x" id="xpClose" aria-label={copy.close} title={copy.close} onClick={p.close}>
          {'×'}
        </button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- one place for the keys of every menu and list below */}
      <div id="xpBody" ref={body} onClick={away} onKeyDown={(e: KeyboardEvent) => keys.onKey(e)}>
        {p.full ? (
          <div className="xlay">
            <Rail section={section} conn={meta.connected} onPick={act.section} />
            <div className="xmain">{content}</div>
          </div>
        ) : (
          content
        )}
      </div>
    </>
  )
}

