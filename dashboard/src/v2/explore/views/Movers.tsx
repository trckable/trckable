// What changed: the biggest changes of every table as one ranked list, a bar from the centre for each, and the top three as chips.
import { isShared } from '../../../lib/me'
import { countryName } from '../../../lib/format'
import { midTruncate } from '../../../features/signals/surge'
import { Flag } from '../../ui/Flag'
import { useV2Extras } from '../../slots'
import type { Cause, Dim, Metric } from '../../why/model'
import { copy } from '../copy'
import { openExplore } from '../open'
import type { Tab } from '../types'

const OPEN: Record<Dim, { tab: Tab; filter: string }> = {
  referrer: { tab: 'sources', filter: 'referrer' },
  entry_page: { tab: 'pages', filter: 'page' },
  country: { tab: 'countries', filter: 'country' },
  device: { tab: 'devices', filter: 'device' },
}

/** A cause in words: no value is Direct, and the bare slash is the home page. */
export const nameOf = (v: string) => (v === '/' ? copy.homePage : v ? midTruncate(v, 36) : copy.direct)

const pick = (c: Cause) => openExplore(OPEN[c.dim].tab, [{ dim: OPEN[c.dim].filter, value: c.value }])
const signed = (n: number, fmt: (n: number) => string) => `${n < 0 ? '−' : '+'}${fmt(Math.abs(n))}`
const kind = (c: Cause) => (c.diff < 0 ? 'dn' : 'up')
/** A country by its name beside its flag; anything else as it is called. */
const label = (c: Cause) => (c.dim === 'country' && c.value ? countryName(c.value) : nameOf(c.value))

/** Under the headline: the top three movers, tinted by the way they went. */
export function MoverChips({ list, metric, fmt }: { list: Cause[]; metric: Metric; fmt: (n: number) => string }) {
  if (!list.length) return null
  return (
    <div className="xmv-chips">
      {list.slice(0, 3).map((c) => (
        <button key={`${c.dim}:${c.value}`} type="button" className={`xmv-chip ${kind(c)}`} title={copy.metric[metric]} onClick={() => pick(c)}>
          {c.dim === 'country' && c.value && <Flag code={c.value} />}
          {label(c)} <b>{signed(c.diff, fmt)}</b>
        </button>
      ))}
    </div>
  )
}

export function MoverList({ list, fmt }: { list: Cause[]; fmt: (n: number) => string }) {
  const { askPeekNow } = useV2Extras()
  const max = Math.max(...list.map((c) => Math.abs(c.diff)), 1)
  const lead = list[0]
  const way = lead.diff < 0 ? 'fell' : 'rose'
  return (
    <>
      <div className="xmv">
        {list.map((c) => (
          <button key={`${c.dim}:${c.value}`} type="button" className="xmv-row" title={`${c.value || copy.direct}: ${fmt(c.was)} → ${fmt(c.now)}`} onClick={() => pick(c)}>
            <span className="xmv-name">
              {c.dim === 'country' && c.value && <><Flag code={c.value} />{' '}</>}
              {label(c)} <em>{copy.dimWord[c.dim]}</em>
            </span>
            <span className="xmv-was">{fmt(c.was)} → {fmt(c.now)}</span>
            <span className="xmv-bar" aria-hidden="true"><i className={kind(c)} style={{ width: `${(Math.abs(c.diff) / max) * 50}%` }} /></span>
            <b className={`xmv-n ${kind(c)}`}>{signed(c.diff, fmt)}</b>
          </button>
        ))}
      </div>
      {askPeekNow && !isShared() && (
        <button type="button" className="xmv-ask" data-ask-peek="1" onClick={() => askPeekNow(copy.moverAsk(nameOf(lead.value), way))}>
          {copy.moverLine(nameOf(lead.value), way)}
        </button>
      )}
    </>
  )
}
