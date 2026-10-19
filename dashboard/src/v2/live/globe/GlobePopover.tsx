// What one pin holds, as a visitor card: their drawn face and name (the same module the journey uses), where they are and
// on what, where they came from, the page, how long, how many visits, and Replay. A pin with several people lists them
// first and slides to the card of the one picked. Only fields we have are shown. On a phone the card is a bottom sheet;
// it stays attached when the visitor leaves ("Left just now") and then closes.
import { ChevronLeft, Cpu, Globe } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '../../../components/visitor/Avatar'
import { DeviceIcon } from '../../../components/visitor/DeviceIcon'
import { SourceMark } from '../../../components/visitor/SourceMark'
import { copy as jcopy } from '../../../features/journey/copy'
import { filterFrom } from '../../../features/journey/filterFrom'
import { useJourney } from '../../../features/journey/useJourney'
import type { Row } from '../../../features/live/model'
import { countryName, flag, fmtDuration } from '../../../lib/format'
import { channelLabel } from '../../../lib/palette'
import { readView } from '../../../lib/url'
import { nameOf } from '../../../lib/visitor'
import { copy } from '../copy'
import { agoOf } from './geo'

const dayStr = (d: Date) => d.toISOString().slice(0, 10)
/** The last 30 days, for the journey behind a visitor (how many visits they have made). */
const QUERY = () => ({ from: dayStr(new Date(Date.now() - 30 * 86_400_000)), to: dayStr(new Date()) })

const ago = (ms: number) => {
  const a = agoOf(ms)
  return a.unit === 's' ? copy.agoSec(a.n) : copy.agoMin(a.n)
}
const sourceOf = (r: Row) => (r.referrer ? r.referrer.replace(/^www\./, '') : channelLabel(r.channel || 'Direct'))
const pageOf = (r: Row) => (r.kind === 'goal' ? `${jcopy.goal}: ${r.label || r.goal}` : (r.path ?? '/'))
const explore = (r: Row) => r.kind === 'pageview' && r.path && filterFrom(readView(new URLSearchParams(location.search)), 'page', r.path)

interface Extra {
  os?: string
  session?: string
  visits?: number
}

interface CardProps {
  row: Row
  clock: number
  gone: boolean
  extra: Extra
  onBack?: () => void
  onClose: () => void
  onVisitor?: (v: string) => void
}

function Head({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="gpop-top">
      {children}
      <button type="button" className="gpop-x" aria-label={copy.close} title={copy.close} onClick={onClose}>
        ×
      </button>
    </div>
  )
}

function Card({ row, clock, gone, extra, onBack, onClose, onVisitor }: CardProps) {
  const place = [row.city, row.country ? countryName(row.country) : ''].filter(Boolean).join(', ')
  return (
    <div className="gcardv">
      <Head onClose={onClose}>
        {onBack && (
          <button type="button" className="gpop-back" aria-label={copy.back} title={copy.back} onClick={onBack}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        )}
        {row.visitor ? <Avatar id={row.visitor} size={64} live={!gone} /> : <span className="gpop-flag" aria-hidden="true">{flag(row.country ?? '')}</span>}
        <div className="gwho">
          <b>{row.visitor ? nameOf(row.visitor) : place}</b>
          {gone ? (
            <span className="mk-quiet">{copy.leftNow}</span>
          ) : (
            <ul className="gfacts">
              {place && <li><span aria-hidden="true">{flag(row.country ?? '')}</span> {place}</li>}
              {extra.os && <li><Cpu size={14} aria-hidden="true" /> {extra.os}</li>}
              {row.device && <li><DeviceIcon device={row.device} /> {row.device}</li>}
              {row.browser && <li><Globe size={14} aria-hidden="true" /> {row.browser}</li>}
            </ul>
          )}
        </div>
      </Head>
      <dl className="grows">
        <div>
          <dt>{copy.from}</dt>
          <dd><SourceMark channel={row.channel || 'Direct'} referrer={row.referrer} size={18} /> {sourceOf(row)}</dd>
        </div>
        <div>
          <dt>{copy.pageNow}</dt>
          <dd><code className="mono">{pageOf(row)}</code></dd>
        </div>
        {extra.session && (
          <div>
            <dt>{jcopy.timeOnSite}</dt>
            <dd>{extra.session}</dd>
          </div>
        )}
        {extra.visits !== undefined && (
          <div>
            <dt>{jcopy.visits}</dt>
            <dd>{extra.visits}</dd>
          </div>
        )}
        <div>
          <dt>{copy.cameIn}</dt>
          <dd>{ago(clock - row.ts)}</dd>
        </div>
      </dl>
      {!gone && (row.visitor || row.path) && (
        <div className="gacts">
          {row.visitor && onVisitor && (
            <button type="button" className="gpop-go" onClick={() => row.visitor && onVisitor(row.visitor)}>
              {'▶'} {copy.replay}
            </button>
          )}
          {row.kind === 'pageview' && row.path && (
            <button type="button" className="gpop-ex" onClick={() => explore(row)}>
              {copy.openExplore}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** The card with the journey's own facts added, where journeys are on: their system, how long this visit, how many visits. */
function Journeyed({ site, ...p }: Omit<CardProps, 'extra'> & { site: string }) {
  const query = useMemo(() => QUERY(), [])
  const j = useJourney(site, p.row.visitor ?? '', query)
  const who = j.status === 'ready' ? j.story.identity : null
  const now = j.status === 'ready' ? j.story.visits[0] : null
  return <Card {...p} extra={{ os: who?.os || undefined, session: now ? fmtDuration((now.end - now.start) / 1000) : undefined, visits: who?.visits }} />
}

export interface Open {
  key: string
  /** The row picked from a list of several, or null while the list shows. */
  row: string | null
  cc: string
  city: string
  lat: number
  lon: number
}

export function GlobePopover({ open, rows, clock, site, onVisitor, onRow, onClose }: { open: Open; rows: Row[]; clock: number; site: string; onVisitor?: (v: string) => void; onRow: (k: string | null) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement | null>(null)
  // The last people seen here: kept when they have all left, so the popover can say so before it goes.
  const [kept, setKept] = useState(rows)
  if (rows.length && rows !== kept) setKept(rows)
  const gone = rows.length === 0
  const list = gone ? kept : rows
  useEffect(() => {
    if (!gone) return
    const t = setTimeout(onClose, 2200)
    return () => clearTimeout(t)
  }, [gone, onClose])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const outside = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', esc)
    document.addEventListener('pointerdown', outside)
    box.current?.focus()
    return () => {
      window.removeEventListener('keydown', esc)
      document.removeEventListener('pointerdown', outside)
    }
  }, [onClose])
  const one = list.length === 1 ? list[0] : (list.find((r) => r.key === open.row) ?? null)
  const title = [open.city, countryName(open.cc)].filter(Boolean).join(', ')
  const card = { clock, gone, onClose, onVisitor, onBack: list.length > 1 ? () => onRow(null) : undefined }
  const withJourney = one && onVisitor && one.visitor
  return (
    <div className="gpop" ref={box} role="dialog" aria-label={title} tabIndex={-1}>
      <div className="gpop-in">
        {one && withJourney && <Journeyed key={one.key} row={one} site={site} {...card} />}
        {one && !withJourney && <Card key={one.key} row={one} extra={{}} {...card} />}
        {!one && (
          <div className="gcardv">
            <Head onClose={onClose}>
              <span className="gpop-flag" aria-hidden="true">{flag(open.cc)}</span>
              <div className="gwho">
                <b>{title}</b>
                <span className="mk-quiet">{copy.here(list.length)}</span>
              </div>
            </Head>
            <div className="gpick">
              {list.map((r) => (
                <button key={r.key} type="button" className="lv" onClick={() => onRow(r.key)}>
                  {r.visitor ? <Avatar id={r.visitor} size={28} /> : <span aria-hidden="true">{flag(r.country ?? '')}</span>}
                  <span className="gpn">{r.visitor ? nameOf(r.visitor) : title}</span>
                  <span className="pg mono">{pageOf(r)}</span>
                  <span className="src">{ago(clock - r.last)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
