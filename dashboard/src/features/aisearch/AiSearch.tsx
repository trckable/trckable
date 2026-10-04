// Who came → AI & Search: how Google and the AI assistants find the site, in
// three columns (three short lists, one above the other, on a narrow card):
// Google's searches and clicks, the visitors AI assistants sent, and the AI
// crawlers that read the pages, with each page's reads against the visitors
// sent. One tab where the AI and Search tabs were.
import { useState } from 'react'
import { Loading } from '../../components/loading/Loading'
import { SearchTerms } from '../../views/SearchTerms'
import type { CardsCtx } from '../cards/ctx'
import { CrawlerSetup } from '../crawlers/CrawlerSetup'
import { Assistants, Column, COLUMN_ROWS, Crawlers } from './Columns'
import { aiCopy } from './copy'
import { useAiSearch } from './useAiSearch'
import './AiSearch.css'

export default function AiSearch({ c }: { c: CardsCtx }) {
  const { rep, reload } = useAiSearch(c.site.id, c.query, COLUMN_ROWS)
  const [setup, setSetup] = useState(false)
  return (
    <>
      {rep === undefined && <Loading height={180} />}
      {rep === null && <p className="faint kit-empty">{aiCopy.failed}</p>}
      {rep && (
        <div className="ais-wrap">
          <div className="ais" role="group" aria-label={aiCopy.label}>
            <Column title={aiCopy.google}>
              <SearchTerms site={c.site} query={c.query} rows={COLUMN_ROWS} />
            </Column>
            <Assistants rep={rep} onPick={(host) => c.addFilter('referrer', host)} />
            <Crawlers rep={rep} onSetup={() => setSetup(true)} onPage={(path) => c.addFilter('page', path)} />
          </div>
        </div>
      )}
      {setup && <CrawlerSetup site={c.site} on={rep?.crawlers ?? false} onChanged={reload} onClose={() => setSetup(false)} />}
    </>
  )
}
