// The pages AI reads against the visitors it sends them: "AI read this 400
// times, sent 12 visitors". Two small numbers and, for the two cases worth
// knowing, a badge that says which. A row filters the dashboard by its page,
// like every other list.
import { Bot, Users } from 'lucide-react'
import { Info } from '../../components/Info'
import type { AiPage } from '../../lib/apiMore'
import { fmtInt } from '../../lib/format'
import { aiCopy } from './copy'

function Flag({ page }: { page: AiPage }) {
  if (!page.flag) return null
  const why = page.flag === 'uncredited' ? aiCopy.flag.uncreditedWhy(page.read) : aiCopy.flag.unreadWhy(page.clicks ?? 0)
  return (
    <Info text={why} align="right">
      <span className={'ais-flag ' + page.flag}>{aiCopy.flag[page.flag]}</span>
    </Info>
  )
}

export function PageRatio({ pages, onPick }: { pages: AiPage[]; onPick: (path: string) => void }) {
  if (pages.length === 0) return null
  return (
    <div className="ais-pages">
      <div className="ais-sub faint">{aiCopy.pages}</div>
      <ul>
        {pages.map((p) => (
          <li key={p.path} className="ais-pg">
            <button type="button" className="ais-pg-main" title={aiCopy.ratio(p.path, p.read, p.sent)} aria-label={aiCopy.ratio(p.path, p.read, p.sent)} onClick={() => onPick(p.path)}>
              <span className="ais-pg-path">{p.path}</span>
              <span className="ais-pg-nums num">
                <span title={aiCopy.readTitle(p.read)}>
                  <Bot size={12} strokeWidth={1.75} aria-hidden="true" />
                  {fmtInt(p.read)}
                </span>
                <span title={aiCopy.sentTitle(p.sent)}>
                  <Users size={12} strokeWidth={1.75} aria-hidden="true" />
                  {fmtInt(p.sent)}
                </span>
              </span>
            </button>
            <Flag page={p} />
          </li>
        ))}
      </ul>
    </div>
  )
}
