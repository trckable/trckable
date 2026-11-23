// What changed, the Briefing: four cards. Today (the one sentence, people and sign-ups, the chart), what moved, where they came from and what they looked at.
import { useState } from 'react'
import { useNotes } from '../../../features/notes/useNotes'
import { fmtInt } from '../../../lib/format'
import { todayIn } from '../../../lib/dates'
import { isShared } from '../../../lib/me'
import { mult } from '../../briefing/model'
import { periodName } from '../../ui/PagePeriod'
import { explain, movers, type Cause } from '../../why/model'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { pathOf } from '../googlePath'
import type { Briefing } from '../types'
import { viewerKcs } from '../viewerKcs'
import { BriefCard } from './BriefCard'
import { MoverList, nameOf } from './Movers'
import { NotesHost } from './NotesHost'
import { Today } from './Today'
import { PagesCard, SourcesCard } from './Trending'

const MOVED = 5

/** How much a number moved as the sentence and the figure beside the people both write it: "10%", or "2.1x" from a doubling. */
export const movedBy = (pct: number): string => (pct >= 100 ? mult(pct / 100 + 1) : `${Math.abs(Math.round(pct))}%`)

function sentence(name: string, kind: string, pct: number | null, diff: number, top?: Cause): string {
  if (kind === 'few') return copy.sayFew
  if (kind === 'flat') return copy.sayFlat
  if (kind === 'mix') return copy.sayMix(name)
  if (pct === null) return copy.sayNew(name)
  const moved = (pct < 0 ? copy.sayFell : copy.sayRose)(name, movedBy(pct))
  if (!top) return copy.sayEnd(moved)
  // "Mostly" only when it is more than half of the move.
  const place = top.value === '/' ? copy.theHomePage : nameOf(top.value)
  return (diff !== 0 && top.diff / diff > 0.5 ? copy.sayMostly : copy.sayLed)(moved, place)
}

/** The people under their floor: the line names the number, with both figures, and leaves the rest of the page as it is. */
function fewOf(now: number, was: number): string {
  return now === 0 && was === 0 ? copy.sayNone : copy.sayFewOf(copy.people, fmtInt(now), fmtInt(was))
}

/** The daily email's lines from the same numbers: the sentence, the four cards, and the biggest changes. */
export function mailOf(d: Briefing) {
  const cur = { ...d.report.current, series: d.report.current.series ?? [] }
  const prev = d.report.previous ? { ...d.report.previous, series: d.report.previous.series ?? [] } : undefined
  const w = prev ? explain(cur, prev, 'visitors') : null
  return {
    headline: w ? sentence(copy.people, w.kind, w.pct, w.diff, w.causes[0]) : copy.sayChoose,
    facts: d.kcs.map((k) => ({ n: k.val, u: k.label.toLowerCase(), t: k.note.t })),
    claims: (w?.causes ?? []).slice(0, 3).map((k) => `${nameOf(k.value)}: ${fmtInt(k.was)} → ${fmtInt(k.now)}`),
  }
}

/** The causes the sentence names first (so the lead it names is always row 1), then the rest of the biggest changes, five in all. */
export function moversOf(causes: Cause[], rest: Cause[]): Cause[] {
  const named = new Set(causes.map((c) => `${c.dim}:${c.value}`))
  return [...causes, ...rest.filter((c) => !named.has(`${c.dim}:${c.value}`))].slice(0, MOVED)
}

export function Changed({ x, d }: { x: XCtx; d: Briefing }) {
  const cur = { ...d.report.current, series: d.report.current.series ?? [] }
  const prev = d.report.previous ? { ...d.report.previous, series: d.report.previous.series ?? [] } : undefined
  const notes = useNotes(x.site.id, { from: x.query.from, to: x.query.to }, () => undefined)
  const [sheet, setSheet] = useState(false)
  // Only where the chart can tell the same numbers as the cards: the whole site, not a share of it, and not on a shared page.
  const chart = !isShared() && x.filters.length === 0 && cur.series.length > 0 && cur.kpis.visitors > 0
  const w = prev ? explain(cur, prev, 'visitors') : null
  const list = prev && w ? moversOf(w.causes, movers(cur, prev, 'visitors')) : []
  // The whole period is too little only when the people of both periods are: one number under its floor says so for itself.
  const whole = !!prev && w?.kind === 'few' && list.length === 0
  let say = copy.sayChoose
  if (w) say = w.kind === 'few' && !whole ? fewOf(w.now, w.was) : sentence(copy.people, w.kind, w.pct, w.diff, w.causes[0])
  return (
    <>
      <Today
        x={x}
        say={say}
        people={viewerKcs(d.kcs)[0]}
        change={w?.kind === 'moved' && w.pct !== null ? { text: `${w.pct < 0 ? '↓' : '↑'} ${movedBy(w.pct)}`, tone: w.pct < 0 ? 'dn' : 'up' } : null}
        title={periodName(x.view.period, { from: x.query.from, to: x.query.to }, todayIn(x.site.timezone))}
        signups={cur.signup ? { n: cur.signup.visitors, of: cur.kpis.visitors } : undefined}
        lost={d.lost}
        incidents={d.down.length}
        report={d.report}
        chart={chart}
        notes={notes.notes}
        plain={whole}
      />
      {!whole && (
        <div className="xbr-row">
          <BriefCard id="moved" title={copy.cardMoved}>
            {list.length > 0 && <MoverList list={list} />}
            {list.length === 0 && <div className="mk-quiet">{copy.nothingMoved}</div>}
          </BriefCard>
          <SourcesCard x={x} cur={cur} prev={prev} google={pathOf(d.google, cur.dims.referrer)} />
          <PagesCard x={x} cur={cur} prev={prev} />
        </div>
      )}
      <NotesHost site={x.site} to={x.query.to} notes={notes.notes} onChanged={notes.load} sheet={sheet} setSheet={setSheet} />
    </>
  )
}
