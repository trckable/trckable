// Design C, the morning briefing: a few plain sentences built from the numbers
// (templates, nothing guessed: a sentence whose fact is unknown is left out),
// then a quiet chip per site. A site that needs you has a line with one action.
import { useState } from 'react'
import { sourceLine, type Surge } from '../features/signals/surge'
import { StateDot } from '../features/sites/StateDot'
import { statusOf } from '../features/sitestatus/status'
import { when } from '../features/sitestatus/time'
import type { Site, SiteRow } from '../lib/api'
import { delta, fmtInt, fmtMoney } from '../lib/format'
import { navigate } from '../lib/url'
import { copy } from './allDesignsCopy'
import { biggestMove, partOfDay, sumOf, wallOrder } from './allDesignsLogic'
import { copy as base } from './allSitesCopy'
import { totalsOf } from './allSitesGroups'
import { longSpan } from './allSitesNeeds'
import { PERIODS } from './AllPeriod'

type Props = { rows: SiteRow[]; sites: Site[]; surges: Map<string, Surge>; days: number }

const nameOf = (x: { name: string; domain: string }) => x.name || x.domain
function chipNumber(r: SiteRow): string {
  if (r.error) return '–'
  return r.visitors > 0 ? fmtInt(r.visitors) : copy.noVisits
}
const open = (domain: string) => '/' + encodeURIComponent(domain)

/** The sentences of the briefing, each with an optional action. */
function lines(rows: SiteRow[], sites: Site[], surges: Map<string, Surge>, days: number) {
  const out: { text: string; to?: string; button?: string; tone?: 'warn' | 'down' }[] = []
  const total = sumOf(rows)
  const period = PERIODS.find((p) => p.days === days)?.label ?? `${days} days`
  if (total.visitors > 0 || total.previous > 0) {
    if (total.previous > 0) {
      const pct = Math.round((Math.abs(total.visitors - total.previous) / total.previous) * 100)
      out.push({ text: copy.totalMove(fmtInt(total.visitors), period, total.visitors >= total.previous, String(pct), days) })
    } else out.push({ text: copy.total(fmtInt(total.visitors), period) })
  }
  const move = biggestMove(rows)
  if (move) {
    const s = surges.get(move.row.id)
    const src = s && !s.ended ? sourceLine(s) : ''
    out.push({ text: (move.by > 0 ? copy.grew : copy.fell)(nameOf(move.row), fmtInt(Math.abs(move.by))) + (src ? ' ' + copy.rightNow(src) + '.' : '') })
  }
  const money = totalsOf(rows).money
  if (money) out.push({ text: copy.earned(fmtMoney(money.amount, money.currency, money.exponent)) })
  if (total.online > 0) out.push({ text: copy.onlineNow(total.online, total.onlineSites) })
  for (const s of sites) {
    const st = statusOf(s)
    if (st === 'down') out.push({ text: copy.downLine(nameOf(s), s.check?.down_since ? when(s.check.down_since) : ''), to: open(s.domain) + '?status=1', button: base.seeWhy, tone: 'down' })
    else if (st === 'quiet' && s.last_event_at) out.push({ text: copy.quietLine(nameOf(s), longSpan(Date.now() / 1000 - s.last_event_at)), to: open(s.domain) + '?status=1', button: base.seeWhy, tone: 'warn' })
  }
  return out
}

export function AllBriefing({ rows, sites, surges, days }: Props) {
  const [hour] = useState(() => new Date().getHours())
  const by = new Map(sites.map((s) => [s.id, s]))
  const sentences = lines(rows, sites, surges, days)
  const fine = !sentences.some((l) => l.tone)
  const total = sumOf(rows)
  const d = delta(total.visitors, total.previous)
  const money = totalsOf(rows).money
  return (
    <>
      <section className="brief" aria-label={copy.briefing}>
        <h2>{copy[partOfDay(hour)]}</h2>
        <dl className="brief-stats">
          <div>
            <dt>{copy.visitors}</dt>
            <dd>
              <b>{fmtInt(total.visitors)}</b>
              {d && <span className={'delta ' + d.tone}>{d.text}</span>}
            </dd>
          </div>
          {total.online > 0 && (
            <div>
              <dt>{copy.onlineLabel}</dt>
              <dd>
                <b>{fmtInt(total.online)}</b>
              </dd>
            </div>
          )}
          {money && (
            <div>
              <dt>{copy.revenue}</dt>
              <dd>
                <b className="rk-money">{fmtMoney(money.amount, money.currency, money.exponent)}</b>
              </dd>
            </div>
          )}
        </dl>
        <ul>
          {sentences.map((l) => (
            <li key={l.text} className={l.tone}>
              <span>{l.text}</span>
              {l.to && l.button && (
                <button type="button" className="btn ghost" onClick={() => navigate(l.to as string)}>
                  {l.button}
                </button>
              )}
            </li>
          ))}
          {fine && <li className="fine">{copy.allFine}</li>}
        </ul>
      </section>
      <section className="chips" aria-label={copy.chips}>
        {wallOrder(rows, sites).map((r) => {
          const site = by.get(r.id)
          const st = site ? statusOf(site) : 'ok'
          const hurt = st === 'down' || st === 'quiet'
          return (
            <button key={r.id} type="button" className={'chip' + (hurt ? ' hurt ' + st : '')} onClick={() => navigate(open(r.domain))}>
              {site && <StateDot site={site} />}
              <b>{nameOf(r)}</b>
              <span className="num muted">{chipNumber(r)}</span>
            </button>
          )
        })}
      </section>
    </>
  )
}
