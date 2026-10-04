// The tab's three columns. Each is a heading with its total and a ranked list;
// the lists are the dashboard's own, so a click filters the way it does
// everywhere else.
import type { ReactNode } from 'react'
import { BarList } from '../../charts/BarList'
import { channelColor } from '../../lib/palette'
import { fmtInt } from '../../lib/format'
import type { AiSearchReport } from '../../lib/apiMore'
import { Plug } from 'lucide-react'
import { assistantOf, byAssistant } from '../extras/assistants'
import { colorOf } from '../crawlers/colors'
import { aiCopy } from './copy'
import { PageRatio } from './PageRatio'

/** How many rows a column shows: three lists share one card. */
export const COLUMN_ROWS = 6

export function Column({ title, total, children }: { title: string; total?: number; children: ReactNode }) {
  return (
    <section className="ais-col" aria-label={title}>
      <h3 className="ais-head">
        <span>{title}</span>
        {total !== undefined && <b className="num">{fmtInt(total)}</b>}
      </h3>
      {children}
    </section>
  )
}

export function Assistants({ rep, onPick }: { rep: AiSearchReport; onPick: (host: string) => void }) {
  const rows = byAssistant(rep.referrers.map((r) => ({ value: r.value, visitors: r.visitors })))
  return (
    <Column title={aiCopy.assistants} total={rep.visitors}>
      <BarList
        dimLabel={aiCopy.assistant}
        valueLabel={aiCopy.visitors}
        loading={false}
        whole={rep.visitors}
        barColor={channelColor('AI')}
        emptyText={aiCopy.noAssistants}
        onPick={onPick}
        pickLabel={(host) => aiCopy.pickAssistant(assistantOf(host), host)}
        items={rows.slice(0, COLUMN_ROWS).map((a) => ({ key: a.referrer, label: a.name, title: a.referrer, value: a.visitors }))}
      />
    </Column>
  )
}

export function Crawlers({ rep, onSetup, onPage }: { rep: AiSearchReport; onSetup: () => void; onPage: (path: string) => void }) {
  const empty = (
    <div className="ais-connect">
      <button type="button" className="btn" onClick={onSetup}>
        <Plug size={14} strokeWidth={1.75} aria-hidden="true" />
        {aiCopy.setup}
      </button>
    </div>
  )
  return (
    <Column title={aiCopy.crawlers} total={rep.crawled}>
      <BarList
        dimLabel={aiCopy.crawler}
        valueLabel={aiCopy.hits}
        loading={false}
        whole={rep.crawled}
        emptyState={empty}
        pickLabel={(k) => aiCopy.botTitle(k.replace('/', ' '), rep.bots.find((b) => b.name + '/' + b.kind === k)?.hits ?? 0)}
        items={rep.bots.slice(0, COLUMN_ROWS).map((b) => ({
          key: b.name + '/' + b.kind,
          label: (
            <>
              {b.name} <span className="faint">{aiCopy.kind[b.kind] ?? b.kind}</span>
            </>
          ),
          title: b.name,
          value: b.hits,
          color: colorOf(b.name),
        }))}
      />
      <PageRatio pages={rep.pages.filter((p) => p.read > 0 || p.flag).slice(0, COLUMN_ROWS)} onPick={onPage} />
    </Column>
  )
}
