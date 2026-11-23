// What moved: the biggest changes of every table as one ranked list, the way each went in tone.
import { isShared } from '../../../lib/me'
import { countryName, fmtInt } from '../../../lib/format'
import { midTruncate } from '../../../features/signals/surge'
import { Flag } from '../../ui/Flag'
import { useV2Extras } from '../../slots'
import type { Cause, Dim } from '../../why/model'
import { copy } from '../copy'
import { openThing, type Thing } from '../thing'

const KIND = { referrer: 'referrer', entry_page: 'page', country: 'country', device: 'device' } as const satisfies Record<Dim, Thing['kind']>

/** A cause in words: no value is Direct, and the bare slash is the home page. */
export function nameOf(v: string): string {
  if (v === '/') return copy.homePage
  return v ? midTruncate(v, 36) : copy.direct
}

const pick = (c: Cause) => openThing(c.dim === 'referrer' && !c.value ? { kind: 'channel', value: 'Direct' } : { kind: KIND[c.dim], value: c.value })
const signed = (n: number) => `${n < 0 ? '−' : '+'}${fmtInt(Math.abs(n))}`
const kind = (c: Cause) => (c.diff < 0 ? 'dn' : 'up')
/** A country by its name beside its flag; anything else as it is called. */
const label = (c: Cause) => (c.dim === 'country' && c.value ? countryName(c.value) : nameOf(c.value))

export function MoverList({ list }: { list: Cause[] }) {
  const { askPeekNow } = useV2Extras()
  const lead = list[0]
  const way = lead.diff < 0 ? 'fell' : 'rose'
  return (
    <>
      <div className="xmv">
        {list.map((c) => (
          <button key={`${c.dim}:${c.value}`} type="button" className="xmv-row" title={`${c.value || copy.direct}: ${fmtInt(c.was)} → ${fmtInt(c.now)}`} onClick={() => pick(c)}>
            <span className="xmv-name">
              {c.dim === 'country' && c.value && <><Flag code={c.value} />{' '}</>}
              {label(c)} <em>{copy.dimWord[c.dim]}</em>
            </span>
            <b className={`xmv-n ${kind(c)}`}>{signed(c.diff)}</b>
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
