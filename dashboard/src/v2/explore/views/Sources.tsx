// Sources: one table of where people came from, with what Google showed and what was clicked beside the people and the
// signups. A tap on Google opens what Google says in a panel beside the table.
import { X } from 'lucide-react'
import { fmtInt } from '../../../lib/format'
import { useEffect, useState } from 'react'
import { answersApi, type AnswersReport, type Engine } from '../../../features/answers/api'
import { hasAnswers } from '../../../lib/me'
import { XNote } from '../../ui/XBits'
import { XCols, type CRow } from '../../ui/XTable'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { useTab } from '../data/useExplore'
import { valueOf } from '../filters'
import { isGoogle } from '../googlePath'
import { rowWords } from '../pointer'
import { rowMark } from '../rowMarks'
import { type QualityRow } from '../data/quality'
import type { Quality as QualityModel, Row, Search as SearchModel, Table } from '../types'
import { PeopleTable } from './PeopleTable'
import { Search } from './Search'
import { fmtK } from './numbers'

/** The Google panel's address word. */
export const GOOGLE = 'google'

const DASH = '–'

/** What Google showed and what was clicked, the very numbers the panel's tiles say (one window, the panel's); null where it is not connected or sent none. */
export function googleSeen(g: SearchModel | null): { seen: number; clicked: number } | null {
  if (!g || !g.on || !g.enough) return null
  return { seen: g.seen, clicked: g.clicked }
}

/** The host that sends an assistant's people, by the engine Answers asks. */
const ENGINE_HOST: Record<Engine, string> = { openai: 'chatgpt.com', perplexity: 'perplexity.ai', anthropic: 'claude.ai' }

/** How many of the assistant's answers named or linked the site in the latest round, for the row of the host that sends its people; null where Answers does not ask that assistant. */
export function mentionsOf(rep: AnswersReport | null | undefined, host: string): number | null {
  const engine = (Object.keys(ENGINE_HOST) as Engine[]).find((e) => ENGINE_HOST[e] === host.replace(/^www\./, ''))
  if (!engine || !rep?.engines.includes(engine)) return null
  return (rep.questions ?? []).reduce((n, q) => n + (q.engines[engine]?.seen ?? 0), 0)
}

/** Answers' latest round, read only where the site has Answers. */
function useMentions(site: string, query: XCtx['query']): AnswersReport | null {
  const [rep, setRep] = useState<AnswersReport | null>(null)
  const key = JSON.stringify([site, query.from, query.to])
  useEffect(() => {
    if (!hasAnswers()) return
    const ac = new AbortController()
    answersApi.report(site, query, ac.signal).then(setRep, () => undefined)
    return () => ac.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- key is the request's content; query is a new object each render
  return rep
}

interface Step {
  seen: string
  clicked: string
}

function stepsOf(r: Row, first: boolean, google: ReturnType<typeof googleSeen>, answers: AnswersReport | null): Step {
  if (first && isGoogle(r.val) && google) return { seen: fmtK(google.seen), clicked: fmtInt(google.clicked) }
  const said = mentionsOf(answers, r.val)
  return { seen: said === null ? DASH : fmtInt(said), clicked: DASH }
}

/** The share of a source's people who stayed, from Quality's read of the top sources; a dash where it did not read the source or had too few people. */
export function engagedOf(rows: QualityRow[] | undefined, value: string): string {
  const e = rows?.find((q) => q.value === value)?.engaged
  return e === null || e === undefined ? DASH : `${Math.round(e * 100)}%`
}

/** The line that says which days the Seen and Clicked of the Google row are for: only where that row shows them. */
export function seenNote(d: Table, g: SearchModel | null): string | null {
  return googleSeen(g) && g?.window && d.rows.some((r) => isGoogle(r.val)) ? copy.seenNote(g.window) : null
}

export function rowsOf(d: Table, google: ReturnType<typeof googleSeen>, answers: AnswersReport | null, quality: QualityModel | null, x: XCtx): CRow[] {
  const max = Math.max(1, ...d.rows.map((r) => r.v))
  const first = d.rows.find((r) => isGoogle(r.val))?.val
  return d.rows.map((r) => {
    const s = stepsOf(r, r.val === first, google, answers)
    const mark = rowMark('sources', r)
    return {
      key: r.val || copy.direct,
      a: (
        <>
          {mark}
          {r.name}
        </>
      ),
      bar: r.v / max,
      onPick: isGoogle(r.val) ? () => x.setSource(x.source === GOOGLE ? null : GOOGLE) : () => (r.val === '' ? x.pick('channel', 'Direct') : x.pick('referrer', r.val)),
      c: [s.seen, s.clicked, fmtInt(r.v), engagedOf(quality?.rows, r.val), r.su === undefined ? DASH : fmtInt(r.su)],
    }
  })
}

const COLS = [{ h: copy.seen, hm: true }, { h: copy.clicked, hm: true }, { h: copy.people }, { h: copy.qEngaged, hm: true }, { h: copy.signedUp }]

function GooglePanel({ x, d, row }: { x: XCtx; d: SearchModel | null; row: string | undefined }) {
  return (
    <aside className="xsrc-panel" data-xpanel="google" aria-label={copy.sub.search}>
      <header className="xsrc-ph">
        <h3>{d?.window ? copy.googleIn(d.window) : copy.sub.search}</h3>
        {row !== undefined && (
          <button type="button" className="xb" onClick={() => x.pick('referrer', row)}>
            {copy.justThisSource}
          </button>
        )}
        <button type="button" className="xsrc-x" aria-label={copy.close} onClick={() => x.setSource(null)}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      {d ? <Search x={x} d={d} /> : <div className="xhold" aria-busy="true" />}
    </aside>
  )
}

export function SourcesView({ x, d }: { x: XCtx; d: Table }) {
  const found = useTab('search', x.data, true)
  const g = found.state === 'ok' ? (found.data as SearchModel) : null
  const asked = useTab('quality', x.data, true)
  const quality = asked.state === 'ok' ? (asked.data as QualityModel) : null
  const answers = useMentions(x.site.id, x.query)
  const row = d.rows.find((r) => isGoogle(r.val))?.val
  if (d.rows.length === 0) {
    // Nothing came from anywhere in this period; the table says so by the section's name, and Google's details, when asked for, still open.
    return (
      <>
        <PeopleTable x={{ ...x, tabName: copy.names.sources[0] }} noneAtAll={d.noneAtAll} rows={[]} head={copy.heads.source} limit={x.limit} of={d.of} onAll={x.showAll} />
        {x.source === GOOGLE && <GooglePanel x={x} d={g} row={undefined} />}
      </>
    )
  }
  const rows = rowsOf(d, googleSeen(g), answers, quality, x)
  // Google's details open in place, the width of the table, under its own row.
  const at = rows.findIndex((r) => r.key === row)
  if (x.source === GOOGLE && at >= 0) rows[at] = { ...rows[at], below: <GooglePanel x={x} d={g} row={row} /> }
  return (
    <>
      <XCols first={copy.heads.source} cols={COLS} rows={rows} xc="minmax(0,1fr) 56px 56px 60px 64px 64px" xcm="minmax(0,1fr) 64px 72px" limit={x.limit} onAll={x.showAll} />
      {x.source === GOOGLE && at < 0 && <GooglePanel x={x} d={g} row={undefined} />}
      {seenNote(d, g) && <XNote>{seenNote(d, g)}</XNote>}
      {quality?.say === copy.qTooFew && <XNote>{copy.qTooFew}</XNote>}
      {valueOf(x.filters, 'referrer') === null && <XNote>{rowWords().source}</XNote>}
    </>
  )
}
