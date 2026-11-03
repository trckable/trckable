// A section as one page: all its tables as cards, read as they come into view, so nothing hides behind a tab.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Sparkles } from 'lucide-react'
import { fmtInt } from '../../lib/format'
import { isShared } from '../../lib/me'
import { useV2Extras } from '../slots'
import { copy } from './copy'
import type { XCtx } from './ctx'
import { useTab, type DataCtx } from './data/useExplore'
import { SectionBody } from './SectionBody'
import { isPlaceTab, PlacesCard } from './views/Places'
import { HOSTED, relatedTo, TABS } from './sections'
import type { Row, Section, Tab } from './types'
import { biggestMover, whyContext } from './whyLine'

/** Tables that already are cards with their own headings. */
const BARE: Tab[] = ['changed', 'overview', 'funnels', 'speed', 'search', 'ai', 'sales']
/** Charts and long rows that need the whole width. */
const WIDE: Tab[] = ['pages', 'devices', 'sources', 'earners', 'highlights', 'overtime', 'hours', 'revmap', 'people', 'flow', 'vsale', 'retention', 'toconvert', 'quality', 'mentions', 'answers', 'payments', 'customers']
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
  // Peek's "Why?": a short question, since Peek already knows the page, the period and the filters, with the card's own numbers beside it; once the card has answered, where the build has Peek. The card's biggest mover shows at once, before any answer. A card with nothing in it hides it in the CSS.
  const canAsk = askPeekNow && !isShared() && (ok || (seen && HOSTED.includes(tab)))
  const [asked, setAsked] = useState(false)
  const rows = ok ? ((r.data as { rows?: Row[] }).rows ?? []) : []
  const ask = () => {
    if (!asked && askPeekNow) askPeekNow(copy.cardAsk(copy.sub[tab]), whyContext(rows, { metric: 'visitors', period: `${x.query.from} to ${x.query.to}`, compare: x.view.compare }))
    setAsked(!asked)
  }
  const why = canAsk && (
    <button type="button" className="xcp-why" data-ask-peek="1" aria-expanded={asked} onClick={ask}>
      <Sparkles size={13} strokeWidth={1.9} aria-hidden="true" />
      {copy.cardWhy}
    </button>
  )
  const mover = biggestMover(rows)
  const strip = canAsk && asked && rows.length > 0 && (
    <p className="xcp-line" data-why-line="1">
      {mover ? (mover.delta > 0 ? copy.whyRose : copy.whyFell)(mover.name === '/' ? copy.homePage : mover.name, fmtInt(mover.before), fmtInt(mover.now), `${mover.delta > 0 ? '+' : '−'}${fmtInt(Math.abs(mover.delta))}`) : copy.whyNone}
    </p>
  )
  const cx: XCtx = { ...x, slim: true, tabName: copy.sub[tab], limit: bare ? x.limit : n, showAll: bare ? x.showAll : () => setN(9999) }
  return (
    <section ref={box} id={`xc-${tab}`} data-xcard={tab} className={`${bare ? 'xcp-bare' : 'xcp'}${bare || WIDE.includes(tab) ? ' wide' : ''}${seen ? ' xcp-in' : ''}`}>
      {!bare && <h3 className="xcp-h">{copy.sub[tab]}{why}</h3>}
      {strip}
      {seen ? <div className={`xcp-b${ok && (r as { stale?: boolean }).stale ? ' is-stale' : ''}`} aria-busy={ok && !!(r as { stale?: boolean }).stale}><SectionBody tab={tab} x={cx} r={r} still /></div> : <div className="xcp-wait" />}
      {bare && why && <div className="xcp-foot">{why}</div>}
      {bare && strip}
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
  // The places tables are one card, with a switch between them: it stands where the first of them would.
  const cards = tabs.filter((t, i) => !isPlaceTab(t) || tabs.findIndex(isPlaceTab) === i)
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
    const f = requestAnimationFrame(() => document.getElementById(`xc-${isPlaceTab(tab) ? 'places' : tab}`)?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])
  return (
    <>
      {say && <p className="xchg-say xsay-page">{say}</p>}
      <div className="xcards" key={section} onPointerMove={glow}>
        {cards.map((t, i) => {
          const read = (s: string | null) => { setAnswered(section); if (s) setSay(s) }
          return isPlaceTab(t) ? <PlacesCard key="places" x={x} c={c} tab={tab} onRead={onRead} onSay={read} /> : <Card key={t} tab={t} x={x} c={c} open={i === 0 || t === tab} onRead={onRead} onSay={read} />
        })}
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
