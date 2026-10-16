// The tables of Explore that are one dimension of the report: pages, channels, referrers, campaigns, countries,
// devices and browsers. A row narrows everything by it when pressed.
import type { Filter, Site } from '../../../lib/api'
import { countryName, flag } from '../../../lib/format'
import type { Range } from '../../../lib/dates'
import { copy } from '../copy'
import { rowsFor, useBands, type Answer } from '../useData'
import type { Tab } from '../sections'
import { XEmpty, XNote, XTable, type TableWords } from '../ui'

export const WORDS: TableWords = { people: copy.people, vsUsual: copy.vsUsual, vsPrevious: copy.vsPrevious, share: copy.share, showAll: copy.showAll }

interface Def {
  dim: string
  /** The filter this row sets (the dimension of the filter menu it belongs to). */
  filter: string
  head: string
  name: (v: string) => string
  mono?: boolean
  flag?: boolean
}

const same = (v: string) => v
export const TABLES: Partial<Record<Tab, Def>> = {
  pages: { dim: 'page', filter: 'page', head: copy.page, name: same, mono: true },
  sources: { dim: 'channel', filter: 'channel', head: copy.source, name: same },
  referrers: { dim: 'referrer', filter: 'referrer', head: copy.referrer, name: (v) => v || '(direct)' },
  utm: { dim: 'campaign', filter: 'campaign', head: copy.campaign, name: same },
  countries: { dim: 'country', filter: 'country', head: copy.country, name: countryName, flag: true },
  devices: { dim: 'device', filter: 'device', head: copy.device, name: same },
  browsers: { dim: 'browser', filter: 'browser', head: copy.browser, name: same },
}

export function DimTable({ tab, site, range, a, filters, comparing, limit, onPick, onAll, onClear, onDetails, day }: {
  tab: Tab
  site: Site
  range: Range
  a: Answer
  filters: Filter[]
  comparing: boolean
  limit: number
  onPick: (dim: string, value: string) => void
  onAll: () => void
  onClear: () => void
  onDetails: (page: string) => void
  /** The day the rows are told against its usual (today or yesterday), when the period is one. */
  day: string | null
}) {
  const def = TABLES[tab]
  const values = (a.cur.dims[def?.dim ?? 'page'] ?? []).slice(0, Math.min(limit, 14)).map((r) => r.value)
  const bands = useBands(site, day ?? range.to, !!day && !comparing && !!def, filters, def?.dim ?? 'page', values)
  if (!def) return null
  const rows = rowsFor(a.cur, a.prev, def.dim, def.name, bands, comparing)
  const picked = filters.find((f) => f.dim === def.filter)?.value ?? null
  const active = filters.length > 0
  const empty = active ? <XEmpty title={copy.noMatch} sub={copy.noMatchSub} action={{ label: copy.clearFilters, run: onClear }} /> : <XEmpty title={copy.nothing} sub={copy.nothingSub} />
  const page = filters.find((f) => f.dim === 'page')?.value
  return (
    <>
      <XTable rows={rows} head={def.head} comparing={comparing} picked={picked} mono={def.mono} flag={def.flag ? flag : undefined} limit={limit} onPick={(v) => onPick(def.filter, v)} words={WORDS} empty={empty} onAll={onAll} />
      {tab === 'pages' && (page ? (
        <XNote>
          <button type="button" className="xb" onClick={() => onDetails(page)}>
            {copy.pageDetails} {'\u203A'}
          </button>
        </XNote>
      ) : (
        <XNote>{copy.tapPage}</XNote>
      ))}
      {tab === 'referrers' && <XNote>{copy.tapSource}</XNote>}
      {tab === 'utm' && <XNote>{copy.onlyTagged}</XNote>}
    </>
  )
}
