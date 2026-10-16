// The sections that are one table of people: pages, sources and where they came from, countries, devices, browsers and
// the links people leave by. Each says what a tap on a row does and what is written under it.
import { XNote } from '../../ui/XBits'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { valueOf } from '../filters'
import { ROW_DIM } from '../sections'
import type { Tab, Table } from '../types'
import { PeopleTable } from './PeopleTable'

interface Cfg {
  head: string
  mono?: boolean
  flags?: boolean
  unit?: string
  min?: number
}

const CFG: Partial<Record<Tab, Cfg>> = {
  pages: { head: copy.heads.page, mono: true },
  sources: { head: copy.heads.source },
  countries: { head: copy.heads.country, flags: true },
  devices: { head: copy.heads.device },
  referrers: { head: copy.heads.referrer, min: 14 },
  utm: { head: copy.heads.campaign },
  browsers: { head: copy.heads.browser },
  outbound: { head: copy.heads.link, mono: true, unit: copy.heads.clicks },
}

function Note({ tab, x }: { tab: Tab; x: XCtx }) {
  if (tab === 'pages')
    return (
      <XNote>
        {valueOf(x.filters, 'page') !== null ? (
          <button type="button" className="xb" onClick={x.pageDetails}>
            {copy.pageDetails} {'›'}
          </button>
        ) : (
          copy.notePage
        )}
      </XNote>
    )
  if (tab === 'referrers') return <XNote>{copy.noteSource}</XNote>
  if (tab === 'utm') return <XNote>{copy.noteUtm}</XNote>
  if (tab === 'outbound') return <XNote>{copy.noteLinks}</XNote>
  return null
}

export function Tables({ tab, x, d }: { tab: Tab; x: XCtx; d: Table }) {
  const c = CFG[tab] ?? CFG.pages ?? { head: '' }
  const dim = d.dim ?? ROW_DIM[tab]
  return (
    <>
      <PeopleTable
        x={x}
        rows={d.rows}
        head={c.head}
        unit={c.unit}
        mono={c.mono}
        flags={c.flags}
        selected={valueOf(x.filters, dim)}
        onPick={dim ? (r) => x.pick(dim, r.val) : undefined}
        dim={dim}
        limit={Math.max(c.min ?? 0, x.limit)}
        onAll={x.showAll}
      />
      <Note tab={tab} x={x} />
    </>
  )
}
