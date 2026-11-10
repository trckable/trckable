// How to improve: at most three things the numbers show, each said plainly, with the evidence and one thing to do.
import { XSec, XNote } from '../../../ui/XBits'
import { aiCopy } from '../../../../features/aisearch/copy'
import { fmtInt } from '../../../../lib/format'
import type { Tip } from './aiTipsOf'
import './aiTips.css'

const t = aiCopy.tip

/** Where a tip's button goes: the setup sheet, a page's filter, or a part of this section. */
export interface TipGo {
  connect: () => void
  page: (path: string) => void
  section: (id: 'crawlers' | 'pages') => void
}

interface Words {
  title: string
  why: string
  go: string
  run: () => void
}

function wordsOf(tip: Tip, go: TipGo): Words {
  switch (tip.id) {
    case 'connect':
      return { ...t.connect, run: go.connect }
    case 'broken': {
      const pages = tip.pages.map((p) => `${p.path} (${fmtInt(p.n)})`).join(', ')
      return { title: t.broken.title(tip.company, tip.errors), why: t.broken.why(pages), go: t.broken.go, run: () => go.section('crawlers') }
    }
    case 'credit': {
      const page = tip.page
      return { title: t.credit.title(tip.assistant, tip.fetches, tip.visitors), why: t.credit.why(page ?? ''), go: page ? t.credit.go : t.credit.goNone, run: () => (page ? go.page(page) : go.section('pages')) }
    }
    case 'blocked':
      return { title: t.blocked.title(tip.blocked), why: t.blocked.why(tip.companies.join(', ')), go: t.blocked.go, run: () => go.section('crawlers') }
    case 'unread':
      return { title: t.unread.title(tip.count), why: t.unread.why(tip.pages.join(', ')), go: t.unread.go, run: () => go.section('pages') }
  }
}

export function AiTips({ tips, go }: { tips: Tip[]; go: TipGo }) {
  if (tips.length === 0) return null
  return (
    <>
      <XSec a={aiCopy.improve} />
      <XNote>{aiCopy.whyImprove}</XNote>
      <ul className="xtips" data-ai-tips>
        {tips.map((tip) => {
          const w = wordsOf(tip, go)
          return (
            <li key={tip.id} className="xtip" data-tip={tip.id}>
              <span className="xtip-dot" aria-hidden="true" />
              <div>
                <b>{w.title}</b>
                <p>{w.why}</p>
              </div>
              <button type="button" className="xb" onClick={w.run}>
                {w.go}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
