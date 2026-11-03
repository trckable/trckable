// The Places section as one card: four numbers over a map of where people are, and under them the table of countries,
// regions, cities, time zones or languages.
import { lazy, Suspense, useEffect, useState } from 'react'
import { fmtInt } from '../../../lib/format'
import { Loading } from '../../../components/loading/Loading'
import { XKcsPlain } from '../../ui/XKcs'
import { XNote } from '../../ui/XBits'
import { SegmentedSwitch } from '../../ui/SegmentedSwitch'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { EXPLORE_ROWS } from '../data/rows'
import { useTab, type DataCtx } from '../data/useExplore'
import { copy as words } from '../placesCopy'
import { SectionBody } from '../SectionBody'
import { shareOf } from '../../ui/XTable'
import type { Row, Table, Tab, Xkc } from '../types'

const PlacesMap = lazy(() => import('../PlacesMap'))

/** The tables the card holds, in the order of its switch. */
export const PLACE_TABS = ['countries', 'regions', 'cities', 'timezones', 'languages'] as const
type PlaceTab = (typeof PLACE_TABS)[number]
export const isPlaceTab = (t: Tab): t is PlaceTab => (PLACE_TABS as readonly string[]).includes(t)

const HEAD: Record<PlaceTab, string> = { countries: copy.heads.country, regions: copy.heads.region, cities: copy.heads.city, timezones: copy.heads.timezone, languages: copy.heads.language }

/** How many places the period had: "100+" when the list was cut at what the report carries. */
const count = (rows: Row[]) => `${fmtInt(rows.length)}${rows.length >= EXPLORE_ROWS ? '+' : ''}`

function tile(label: string, rows: Row[], kept: boolean): Xkc {
  if (rows.length > 0) return { icon: 'places', label, val: count(rows), tag: '', tone: '', detail: words.tileWith }
  return { icon: 'places', label, val: '–', tag: '', tone: '', detail: kept ? words.tileNone : words.tileNotKept }
}

/** The four numbers. Regions and cities say "not recorded" only when people came and none of them was placed. */
export function tiles(c: Table, r: Table, ci: Table): Xkc[] {
  const top = c.rows[0]
  const kept = c.rows.length === 0 || r.rows.length > 0 || ci.rows.length > 0
  return [
    tile(words.tileCountries, c.rows, true),
    tile(words.tileRegions, r.rows, kept),
    tile(words.tileCities, ci.rows, kept),
    { icon: 'places', label: words.tileTop, val: top ? top.name : '–', flag: top?.code, tag: '', tone: '', detail: top ? words.topShare(shareOf(top.v, c.of)) : words.tileNone },
  ]
}

function TilesLoading() {
  return (
    <div className="xkw" aria-hidden="true">
      <div className="kcs xk">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className="sk kcsk" />
        ))}
      </div>
    </div>
  )
}

export function PlacesCard({ x, c, tab: asked, onRead, onSay }: { x: XCtx; c: DataCtx; tab: Tab; onRead: () => void; onSay: (s: string | null) => void }) {
  const [tab, setTab] = useState<PlaceTab>(isPlaceTab(asked) ? asked : 'countries')
  // The address names another of the tables: the switch follows.
  const [was, setWas] = useState(asked)
  if (asked !== was) {
    setWas(asked)
    if (isPlaceTab(asked)) setTab(asked)
  }
  const rc = useTab('countries', c, true)
  const rr = useTab('regions', c, true)
  const rci = useTab('cities', c, true)
  const shown = useTab(tab, c, true)
  const said = rc.state === 'ok' ? ((rc.data as Table).say ?? null) : null
  useEffect(() => {
    if (rc.state !== 'ok') return
    onRead()
    onSay(said)
    // Each answer moves the time the page says it was read, and the section's one line is the countries'.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rc.state, said])
  const ready = rc.state === 'ok' && rr.state === 'ok' && rci.state === 'ok'
  const cx: XCtx = { ...x, tabName: copy.sub[tab] }
  return (
    <section id="xc-places" data-xcard="places" className="xcp wide xcp-in">
      <div className="xcp-b">
      {ready ? (
        <>
          <XKcsPlain items={tiles(rc.data as Table, rr.data as Table, rci.data as Table)} />
          {(rc.data as Table).rows.length > 0 && (
            <Suspense fallback={<Loading height={190} />}>
              <PlacesMap rows={(rc.data as Table).rows} onPick={(code) => x.pick('country', code)} />
            </Suspense>
          )}
        </>
      ) : (
        rc.state !== 'error' && <TilesLoading />
      )}
      <div className="xplaces-tabs">
        <SegmentedSwitch label={words.tabs} value={tab} onChange={setTab} items={PLACE_TABS.map((t) => ({ value: t, label: HEAD[t] }))} />
      </div>
      <SectionBody tab={tab} x={cx} r={shown} still />
      {tab === 'timezones' && <XNote>{words.noteZones}</XNote>}
      </div>
    </section>
  )
}
