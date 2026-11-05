// The Places section as one card: four numbers over a map of where people are, and under them the table of countries,
// regions, cities, time zones or languages.
import { lazy, Suspense, useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { fmtInt } from '../../../lib/format'
import { isShared } from '../../../lib/me'
import { useV2Extras } from '../../slots'
import { biggestMover, whyContext } from '../whyLine'
import { Loading } from '../../../components/loading/Loading'
import { XKcsPlain } from '../../ui/XKcs'
import { XNote } from '../../ui/XBits'
import { SegmentedSwitch } from '../../ui/SegmentedSwitch'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { EXPLORE_ROWS } from '../data/rows'
import { useTab, type DataCtx } from '../data/useExplore'
import { copy as words } from '../placesCopy'
import { DbIp } from './DbIp'
import { SectionBody } from '../SectionBody'
import { shareOf } from '../../ui/XTable'
import type { Row, Table, Tab, Xkc } from '../types'

const PlacesMap = lazy(() => import('../PlacesMap'))

/** The tables the card holds, in the order of its switch. */
export const PLACE_TABS = ['countries', 'regions', 'cities', 'timezones', 'languages'] as const
type PlaceTab = (typeof PLACE_TABS)[number]
export const isPlaceTab = (t: Tab): t is PlaceTab => (PLACE_TABS as readonly string[]).includes(t)

const HEAD: Record<PlaceTab, string> = { countries: copy.heads.country, regions: copy.heads.region, cities: copy.heads.city, timezones: copy.heads.timezone, languages: copy.heads.language }

/** The switch's tables: time zones only once a visit has named one (older visits, and sites that keep no region or city, have none to list). */
export function tabs(zones: Table | null): PlaceTab[] {
  const named = !!zones && zones.rows.some((r) => r.val !== '' && r.val.toLowerCase() !== 'unknown')
  return PLACE_TABS.filter((t) => t !== 'timezones' || named)
}

/** How many places the period had: "100+" when the list was cut at what the report carries. */
const count = (rows: Row[]) => `${fmtInt(rows.length)}${rows.length >= EXPLORE_ROWS ? '+' : ''}`

function tile(icon: string, label: string, rows: Row[], kept: boolean): Xkc {
  if (rows.length > 0) return { icon, label, val: count(rows), tag: '', tone: '', detail: words.tileWith }
  return { icon, label, val: '–', tag: '', tone: '', detail: kept ? words.tileNone : words.tileNotKept }
}

/** The four numbers. Regions and cities say "not recorded" only when people came and none of them was placed. */
export function tiles(c: Table, r: Table, ci: Table): Xkc[] {
  const top = c.rows[0]
  const kept = c.rows.length === 0 || r.rows.length > 0 || ci.rows.length > 0
  return [
    tile('countries', words.tileCountries, c.rows, true),
    tile('map', words.tileRegions, r.rows, kept),
    tile('building', words.tileCities, ci.rows, kept),
    { icon: 'places', label: words.tileTop, val: top ? top.name : '–', flag: top?.code, tag: '', tone: '', detail: top ? words.topShare(shareOf(top.v, c.of)) : words.tileNone },
  ]
}

function TilesLoading() {
  return (
    <div className="xkw" aria-hidden="true">
      <div className="sumrow">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className="sk sumsk" />
        ))}
      </div>
    </div>
  )
}

export function PlacesCard({ x, c, tab: asked, onRead, onSay }: { x: XCtx; c: DataCtx; tab: Tab; onRead: () => void; onSay: (s: string | null) => void }) {
  const [picked, setTab] = useState<PlaceTab>(isPlaceTab(asked) ? asked : 'countries')
  // The address names another of the tables: the switch follows.
  const [was, setWas] = useState(asked)
  if (asked !== was) {
    setWas(asked)
    if (isPlaceTab(asked)) setTab(asked)
  }
  const rc = useTab('countries', c, true)
  const rr = useTab('regions', c, true)
  const rci = useTab('cities', c, true)
  const rz = useTab('timezones', c, true)
  const list = tabs(rz.state === 'ok' ? (rz.data as Table) : null)
  // An address that names the time zones, with none to list, opens the countries.
  const tab = list.includes(picked) ? picked : 'countries'
  const shown = useTab(tab, c, true)
  const said = rc.state === 'ok' ? ((rc.data as Table).say ?? null) : null
  useEffect(() => {
    if (rc.state !== 'ok') return
    onRead()
    onSay(said)
    // Each answer moves the time the page says it was read, and the section's one line is the countries'.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rc.state, said])
  // Peek's "Why?", as the other cards have it: a short question with the card's own numbers beside it, and the biggest mover under it.
  const { askPeekNow } = useV2Extras()
  const [open, setOpen] = useState(false)
  const rows = shown.state === 'ok' ? (shown.data as Table).rows : []
  const mover = biggestMover(rows)
  const ask = () => {
    if (!open && askPeekNow) askPeekNow(copy.cardAsk(copy.sub[tab]), whyContext(rows, { metric: 'visitors', period: `${x.query.from} to ${x.query.to}`, compare: x.view.compare }))
    setOpen(!open)
  }
  const why = askPeekNow && !isShared() && shown.state === 'ok' && (
    <button type="button" className="xcp-why" data-ask-peek="1" aria-expanded={open} onClick={ask}>
      <Sparkles size={13} strokeWidth={1.9} aria-hidden="true" />
      {copy.cardWhy}
    </button>
  )
  const ready = rc.state === 'ok' && rr.state === 'ok' && rci.state === 'ok'
  const cx: XCtx = { ...x, tabName: copy.sub[tab] }
  return (
    <>
    {ready ? <XKcsPlain items={tiles(rc.data as Table, rr.data as Table, rci.data as Table)} /> : rc.state !== 'error' && <TilesLoading />}
    <section id="xc-places" data-xcard="places" className="xcp wide xcp-in">
      <div className="xcp-b">
        {why && <div className="xplaces-why">{why}</div>}
        {why && open && rows.length > 0 && (
          <p className="xcp-line" data-why-line="1">
            {mover ? (mover.delta > 0 ? copy.whyRose : copy.whyFell)(mover.name, fmtInt(mover.before), fmtInt(mover.now), `${mover.delta > 0 ? '+' : '−'}${fmtInt(Math.abs(mover.delta))}`) : copy.whyNone}
          </p>
        )}
      {ready && (rc.data as Table).rows.length > 0 && (
        <Suspense fallback={<Loading height={190} />}>
          <PlacesMap rows={(rc.data as Table).rows} onPick={(code) => x.pick('country', code)} />
        </Suspense>
      )}
      <div className="xplaces-tabs">
        <SegmentedSwitch label={words.tabs} value={tab} onChange={setTab} items={list.map((t) => ({ value: t, label: HEAD[t] }))} />
      </div>
      <SectionBody tab={tab} x={cx} r={shown} still />
      {tab === 'timezones' && <XNote>{words.noteZones}</XNote>}
      {tab !== 'languages' && <XNote><DbIp label={words.credit} /></XNote>}
      </div>
    </section>
    </>
  )
}
