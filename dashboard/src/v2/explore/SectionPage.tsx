// A section as one page: all its tables as cards, read as they come into view, so nothing hides behind a tab.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { CircleHelp } from 'lucide-react'
import { isShared } from '../../lib/me'
import { useV2Extras } from '../slots'
import { cardAsk } from './cardAsk'
import { copy } from './copy'
import type { XCtx } from './ctx'
import { useTab, type DataCtx } from './data/useExplore'
import { SectionBody } from './SectionBody'
import { HOSTED, relatedTo, TABS } from './sections'
import type { Section, Tab } from './types'

/** Tables that already are cards with their own headings. */
const BARE: Tab[] = ['changed', 'overview', 'funnels', 'speed', 'search', 'ai', 'sales']
/** Charts and long rows that need the whole width. */
const WIDE: Tab[] = ['pages', 'sources', 'earners', 'highlights', 'overtime', 'hours', 'revmap', 'people', 'flow', 'vsale', 'retention', 'toconvert', 'quality', 'mentions', 'answers', 'buyers']
const ROWS = 5

function Card({ tab, x, c, open, onRead, onSay }: { tab: Tab; x: XCtx; c: DataCtx; open: boolean; onRead: () => void; onSay: (s: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(open)
  const [n, setN] = useState(ROWS)
  const r = useTab(tab, c, seen && !HOSTED.includes(tab))
  const ok = r.state === 'ok'
  const said = ok ? ((r.data as { say?: string | null }).say ?? null) : null
  useEffect(() => {
    if (ok && tab !== 'quality') onSay(said)
    // The section's one line, from the table that has one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [said, ok])
  useEffect(() => {
    if (seen || HOSTED.includes(tab)) onRead()
    // Each answer moves the time the page says it was read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, seen])
  useEffect(() => {
    const el = box.current
    if (!el || seen) return
    const io = new IntersectionObserver((e) => e.some((i) => i.isIntersecting) && setSeen(true), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  const bare = BARE.includes(tab)
  const { askPeekNow } = useV2Extras()
  // Peek's "Why?": once the card has answered, where the build has Peek. A card with nothing in it hides it in the CSS.
  const canAsk = askPeekNow && !isShared() && (ok || (seen && HOSTED.includes(tab)))
  const why = canAsk && (
    <button type="button" className="xcp-why" data-ask-peek="1" onClick={() => askPeekNow(cardAsk(copy.sub[tab], x.query.from, x.query.to, x.filters, ok ? (r.data as Parameters<typeof cardAsk>[4]) : null))}>
      <CircleHelp size={13} strokeWidth={1.9} aria-hidden="true" />
      {copy.cardWhy}
    </button>
  )
  const cx: XCtx = { ...x, slim: true, tabName: copy.sub[tab], limit: bare ? x.limit : n, showAll: bare ? x.showAll : () => setN(9999) }
  return (
    <section ref={box} id={`xc-${tab}`} data-xcard={tab} className={`${bare ? 'xcp-bare' : 'xcp'}${bare || WIDE.includes(tab) ? ' wide' : ''}${seen ? ' xcp-in' : ''}`}>
      {!bare && <h3 className="xcp-h">{copy.sub[tab]}{why}</h3>}
      {seen ? <div className={`xcp-b${ok && (r as { stale?: boolean }).stale ? ' is-stale' : ''}`} aria-busy={ok && !!(r as { stale?: boolean }).stale}><SectionBody tab={tab} x={cx} r={r} still /></div> : <div className="xcp-wait" />}
      {bare && why && <div className="xcp-foot">{why}</div>}
    </section>
  )
}

/** The soft light under the pointer: the card it is on takes the place. */
function glow(e: PointerEvent<HTMLDivElement>) {
  const card = (e.target as Element).closest<HTMLElement>('.xcp,.kc,.xcards .xfade>.x2>div')
  if (!card) return
  const r = card.getBoundingClientRect()
  card.style.setProperty('--mx', `${e.clientX - r.left}px`)
  card.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export function SectionPage({ section, tab, x, c, onRead }: { section: Section; tab: Tab; x: XCtx; c: DataCtx; onRead: () => void }) {
  const tabs = TABS[section]
  const [say, setSay] = useState<string | null>(null)
  // The way on stands under the cards: drawn once the first has answered, so it does not slide down as they fill.
  const [answered, setAnswered] = useState<Section | null>(null)
  useEffect(() => {
    if (scrollY > 0 && tab === tabs[0]) scrollTo({ top: 0 })
    // A new section starts from its top.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])
  useEffect(() => {
    if (tab === tabs[0]) return
    // The table the address names, each time it names another; after a move from Live has put the page at its top.
    const f = requestAnimationFrame(() => document.getElementById(`xc-${tab}`)?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])
  return (
    <>
      {say && <p className="xchg-say xsay-page">{say}</p>}
      <div className="xcards" key={section} onPointerMove={glow}>
        {tabs.map((t, i) => <Card key={t} tab={t} x={x} c={c} open={i === 0 || t === tab} onRead={onRead} onSay={(s) => { setAnswered(section); if (s) setSay(s) }} />)}
      </div>
      {answered === section && <nav className="xnext" aria-label={copy.keepGoing}>
        {relatedTo(section).map((s) => (
          <button key={s} type="button" className="xb" data-xnext={s} onClick={() => x.goTo(TABS[s][0])}>
            {copy.names[s][0]} {'›'}
          </button>
        ))}
      </nav>}
    </>
  )
}
