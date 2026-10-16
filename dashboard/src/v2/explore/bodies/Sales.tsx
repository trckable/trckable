// Sales: each payment with what it was, where it came from and when; by kind. Without revenue connected it is a row
// that says how connecting helps.
import { useEffect, useState } from 'react'
import { call, rangeQS, type Site } from '../../../lib/api'
import type { Range } from '../../../lib/dates'
import { setupOf } from '../../briefing/steps'
import { SetupRow } from '../../ui/ConnectPlaceholder'
import type { Buyer } from '../../../features/extras/extrasApi'
import { copy } from '../copy'
import { XEmpty, XSec, XSub } from '../ui'

type Kind = '' | 'new' | 'upgrade' | 'renewal' | 'refund'

export function Sales({ site, range, money, limit, onAll, onGoal }: { site: Site; range: Range; money?: (minor: number) => string; limit: number; onAll: () => void; onGoal: () => void }) {
  const [kind, setKind] = useState<Kind>('')
  const [list, setList] = useState<Buyer[] | null>(null)
  useEffect(() => {
    if (!money) return
    let live = true
    void call<{ buyers: Buyer[] }>('GET', `/sites/${site.id}/buyers` + rangeQS({ from: range.from, to: range.to }) + '&n=60').then((r) => live && setList(r.buyers ?? []), () => live && setList([]))
    return () => {
      live = false
    }
  }, [site.id, range.from, range.to, money])
  if (!money) return <SetupRow s={setupOf('rev', site, onGoal)} big />
  if (!list) return null
  const shown = list.filter((b) => !kind || b.kind === kind)
  const net = shown.reduce((a, b) => a + (b.kind === 'refund' ? -b.amount : b.amount), 0)
  return (
    <>
      <XSub
        items={([{ id: '', name: copy.kinds.all }, { id: 'new', name: copy.kinds.new }, { id: 'upgrade', name: copy.kinds.upgrade }, { id: 'renewal', name: copy.kinds.renewal }, { id: 'refund', name: copy.kinds.refund }] as { id: Kind; name: string }[])}
        cur={kind}
        label={copy.kindOf}
        onPick={setKind}
      />
      <XSec l={copy.salesCount(shown.length)} r={copy.netWord(money(net))} />
      {shown.length === 0 ? (
        <XEmpty title={copy.noSalesKind} sub={copy.nothingSub} action={kind ? { label: copy.showAllSales, run: () => setKind('') } : undefined} />
      ) : (
        shown.slice(0, limit).map((b) => (
          <div className="sale" key={b.id}>
            <span className={`mk-tag ${b.kind}`}>{b.kind}</span>
            <span className="gn">
              <div>{copy.kinds[b.kind as keyof typeof copy.kinds] ?? b.kind}</div>
              <div className="mk-quiet" style={{ fontSize: 12 }}>
                {[b.referrer || b.channel, b.at.slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · ')}
              </div>
            </span>
            <span className={`amt${b.kind === 'refund' ? ' neg' : ''}`}>
              {b.kind === 'refund' ? '' : '+'}
              {money(b.kind === 'refund' ? -b.amount : b.amount)}
            </span>
          </div>
        ))
      )}
      {shown.length > limit && (
        <button type="button" className="mk-more" onClick={onAll}>
          {copy.showAll(shown.length)}
        </button>
      )}
    </>
  )
}
