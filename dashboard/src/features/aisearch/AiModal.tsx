// The AI & Search guide card's dialog: which assistants sent visitors (a bar each), the pages they
// landed on, when it happened as a small line, and one line of what it means. For a crawler: which
// robots read the site and which pages. "See all in AI & Search" is the way on.
import { Bot } from 'lucide-react'
import { useMemo } from 'react'
import { Bars, busiest, Meaning, Part, Spark } from '../../components/CardModal/parts'
import { CardModal } from '../../components/CardModal/CardModal'
import { cardModal } from '../../components/CardModal/copy'
import { periodOf } from '../../components/CardModal/period'
import { Loading } from '../../components/loading/Loading'
import { fmtInt } from '../../lib/format'
import { assistantOf, byAssistant } from '../extras/assistants'
import { aiCopy, aiModalCopy as t, guideCopy } from './copy'
import { useAiModal } from './useAiModal'
import type { AiSeen } from './useAiSeen'

export default function AiModal({ site, seen, onClose, onGo }: { site: { id: string; timezone: string }; seen: AiSeen; onClose: () => void; onGo: () => void }) {
  const period = useMemo(() => periodOf(site.timezone), [site.timezone])
  const data = useAiModal(site.id, period)
  const crawler = seen === 'crawler'
  const rep = data?.rep
  const assistants = rep ? byAssistant(rep.referrers.map((r) => ({ value: r.value, visitors: r.visitors }))).slice(0, 5) : []
  const landed = rep ? rep.pages.filter((p) => p.sent > 0).sort((a, b) => b.sent - a.sent).slice(0, 5) : []
  const read = rep ? rep.pages.filter((p) => p.read > 0).sort((a, b) => b.read - a.read).slice(0, 5) : []
  const series = data?.series ?? []
  return (
    <CardModal
      label={guideCopy[seen].label}
      kind={{ icon: <Bot size={14} strokeWidth={2} />, label: guideCopy[seen].label, tint: 'var(--ch-6)' }}
      when={{ text: period.text, title: cardModal.inPeriod }}
      title={
        <>
          {rep ? fmtInt(crawler ? rep.crawled : rep.visitors) : '…'}
          <small>{crawler ? t.crawled : t.visitors}</small>
        </>
      }
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {cardModal.close}
          </button>
          <button type="button" className="btn primary" onClick={onGo}>
            {t.seeAll}
          </button>
        </>
      }
    >
      {data === undefined && <Loading height={160} />}
      {data === null && <p className="faint kit-empty">{aiCopy.failed}</p>}
      {rep && !crawler && (
        <>
          <Part title={aiCopy.assistants}>
            {assistants.length ? <Bars label={aiCopy.assistants} rows={assistants.map((a) => ({ key: a.name, label: assistantOf(a.referrer), n: a.visitors }))} /> : <p className="faint">{aiCopy.noAssistants}</p>}
          </Part>
          {landed.length > 0 && (
            <Part title={t.landed}>
              <Bars label={t.landed} rows={landed.map((p) => ({ key: p.path, label: <code>{p.path}</code>, n: p.sent }))} />
            </Part>
          )}
          {series.length > 1 && (
            <Part title={t.when}>
              <Spark values={series} hl={busiest(series)} label={t.whenLabel} />
            </Part>
          )}
        </>
      )}
      {rep && crawler && (
        <>
          <Part title={aiCopy.crawlers}>
            {rep.bots.length ? <Bars label={aiCopy.crawlers} rows={rep.bots.slice(0, 5).map((b) => ({ key: b.name + b.kind, label: b.name, n: b.hits, text: t.reads(b.hits) }))} /> : <p className="faint">{cardModal.none}</p>}
          </Part>
          {read.length > 0 && (
            <Part title={t.readPages}>
              <Bars label={t.readPages} rows={read.map((p) => ({ key: p.path, label: <code>{p.path}</code>, n: p.read, text: t.reads(p.read) }))} />
            </Part>
          )}
        </>
      )}
      {rep && <Meaning>{crawler ? t.meansCrawler : t.meansVisitor}</Meaning>}
    </CardModal>
  )
}
