// The top of AI & Search: how much AI reads the site against the people who come, and what the assistants send back.
import { SummaryCards, type SumItem } from '../../../ui/SummaryCards'
import { fmtCompact, fmtFixed, fmtInt } from '../../../../lib/format'
import type { AiSearchReport } from '../../../../lib/apiMore'
import { aiCopy } from '../../../../features/aisearch/copy'

const h = aiCopy.headline

/** Four cards with crawler data; without it only the visitors AI sent (the rest would be zeros that say nothing). */
export function headlineItems(rep: AiSearchReport): SumItem[] {
  const sent: SumItem = { key: 'sent', data: 'sent', icon: 'search', label: h.sent, val: fmtInt(rep.visitors), sub: h.sentSub }
  const top = rep.companies[0]
  if (rep.crawled <= 0 || !top) return [sent]
  return [
    { key: 'requests', data: 'requests', icon: 'eye', label: h.requests, val: fmtCompact(rep.crawled), title: fmtInt(rep.crawled), sub: h.requestsSub },
    rep.per_visitor > 0
      ? { key: 'per', data: 'per', icon: 'people', label: h.perVisitor, val: `${fmtFixed(rep.per_visitor, 1)}×`, sub: h.perVisitorSub }
      : { key: 'per', data: 'per', icon: 'people', label: h.perVisitor, val: '–', sub: h.noVisitors },
    { key: 'top', data: 'top', icon: 'tech', label: h.topCompany, val: top.name, sub: h.topCompanySub(top.hits), title: `${top.name}: ${fmtInt(top.hits)}` },
    sent,
  ]
}

export const AiHeadline = ({ rep }: { rep: AiSearchReport }) => <SummaryCards items={headlineItems(rep)} />
