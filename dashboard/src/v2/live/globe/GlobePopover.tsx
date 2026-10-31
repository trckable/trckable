// What one pin holds, as a visitor card: their drawn face and name (the same module the journey uses), where they are and
// on what, where they came from, the page, how long, how many visits, and Replay. Only fields we have are shown. On a phone the card is a bottom sheet;
// it stays attached when the visitor leaves ("Left just now") and then closes.
import { Cpu, Globe } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from '../../../components/visitor/Avatar'
import { DeviceIcon } from '../../../components/visitor/DeviceIcon'
import { SourceMark } from '../../../components/visitor/SourceMark'
import { copy as jcopy } from '../../../features/journey/copy'
import { useJourney } from '../../../features/journey/useJourney'
import type { Row } from '../../../features/live/model'
import { countryName, fmtDuration } from '../../../lib/format'
import { useNarrow } from '../../../lib/useNarrow'
import { channelLabel } from '../../../lib/palette'
import { nameOf } from '../../../lib/visitor'
import { openExplore } from '../../explore/open'
import { copy } from '../copy'
import { GlobeCrowd } from './GlobeCrowd'
import { agoOf } from './geo'
import { Flag } from '../../ui/Flag'

const dayStr = (d: Date) => d.toISOString().slice(0, 10)
/** The last 30 days, for the journey behind a visitor (how many visits they have made). */
const QUERY = () => ({ from: dayStr(new Date(Date.now() - 30 * 86_400_000)), to: dayStr(new Date()) })

const ago = (ms: number) => {
  const a = agoOf(ms)
  return a.unit === 's' ? copy.agoSec(a.n) : copy.agoMin(a.n)
}
const sourceOf = (r: Row) => (r.referrer ? r.referrer.replace(/^www\./, '') : channelLabel(r.channel || 'Direct'))
const pageOf = (r: Row) => (r.kind === 'goal' ? `${jcopy.goal}: ${r.label || r.goal}` : (r.path ?? '/'))
const explore = (r: Row) => r.kind === 'pageview' && r.path && openExplore('pages', [{ dim: 'page', value: r.path }])

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
  onClose: () => void
  onVisitor?: (v: string) => void
  onLeave: () => void
  /** Set when the card was opened from a list of people: a way back to it. */
  onBack?: () => void
}

function Head({ children, onClose, onBack }: { children: React.ReactNode; onClose: () => void; onBack?: () => void }) {
  return (
    <div className="gpop-top">
      {onBack && (
        <button type="button" className="gpop-x gpop-back" aria-label={copy.back} title={copy.back} onClick={onBack}>
          ←
        </button>
      )}
      {children}
      <button type="button" className="gpop-x" aria-label={copy.close} title={copy.close} onClick={onClose}>
        ×
      </button>
    </div>
  )
}

function Card({ row, clock, gone, extra, onClose, onVisitor, onLeave, onBack }: CardProps) {
  const place = [row.city, row.country ? countryName(row.country) : ''].filter(Boolean).join(', ')
  return (
    <div className="gcardv">
      <Head onClose={onClose} onBack={onBack}>
        {row.visitor ? <Avatar id={row.visitor} size={64} live={!gone} /> : <span className="gpop-flag"><Flag code={row.country ?? ''} width={32} /></span>}
        <div className="gwho">
          <b>{row.visitor ? nameOf(row.visitor) : place}</b>
          {gone ? (
            <span className="mk-quiet">{copy.leftNow}</span>
          ) : (
            <ul className="gfacts">
              {place && <li><Flag code={row.country ?? ''} /> {place}</li>}
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
            <button type="button" className="gpop-go" onClick={() => {
              onLeave()
              if (row.visitor) onVisitor(row.visitor)
            }}>
              {'▶'} {copy.replay}
            </button>
          )}
          {row.kind === 'pageview' && row.path && (
            <button type="button" className="gpop-ex" onClick={() => {
                onLeave()
                explore(row)
              }}>
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
  /** The visitor's row key. */
  key: string
  /** Everyone in the marker, when it opened as a list. */
  crowd?: string[]
  cc: string
  city: string
  lat: number
  lon: number
}

/** `onLeave` runs before a button acts: the card closes and the globe's full screen ends, so neither covers the replay or Explore. */
export function GlobePopover({ open, row, crowd, clock, site, onVisitor, onClose, onLeave }: { open: Open; row: Row | undefined; crowd?: Row[]; clock: number; site: string; onVisitor?: (v: string) => void; onClose: () => void; onLeave: () => void }) {
  const phone = useNarrow()
  const box = useRef<HTMLDivElement | null>(null)
  // The visitor as last seen: kept when they have left, so the card can say so before it goes.
  // From a list, the card is the row picked in it; until one is picked, the list shows.
  const [pick, setPick] = useState<string | null>(null)
  const listing = !!crowd && !pick
  const target = crowd ? crowd.find((r) => r.key === pick) : row
  const [kept, setKept] = useState(target)
  if (target && target !== kept) setKept(target)
  const gone = listing ? crowd.length === 0 : !target
  const shown = listing ? undefined : (target ?? kept)
  const back = crowd ? () => setPick(null) : undefined
  useEffect(() => {
    if (!gone) return
    const t = setTimeout(onClose, 2200)
    return () => clearTimeout(t)
  }, [gone, onClose])
  useEffect(() => {
    // First in line (capture): Esc closes the card before it leaves full screen.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    const outside = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', esc, true)
    document.addEventListener('pointerdown', outside)
    box.current?.focus()
    return () => {
      window.removeEventListener('keydown', esc, true)
      document.removeEventListener('pointerdown', outside)
    }
  }, [onClose])
  const title = [open.city, countryName(open.cc)].filter(Boolean).join(', ')
  const withJourney = shown && onVisitor && shown.visitor
  // On a phone the card is a sheet over the screen's foot: it is placed in the page's root, since inside the Live view's own layer it would stay under the tab bar.
  const card = (
    <div className="gpop" ref={box} role="dialog" aria-label={title} tabIndex={-1}>
      <div className="gpop-in">
        {shown && withJourney && <Journeyed key={shown.key} row={shown} site={site} clock={clock} gone={gone} onClose={onClose} onVisitor={onVisitor} onLeave={onLeave} onBack={back} />}
        {shown && !withJourney && <Card key={shown.key} row={shown} extra={{}} clock={clock} gone={gone} onClose={onClose} onVisitor={onVisitor} onLeave={onLeave} onBack={back} />}
        {listing && <GlobeCrowd rows={crowd} title={open.city || countryName(open.cc)} clock={clock} onPick={setPick} onClose={onClose} />}
      </div>
    </div>
  )
  return phone ? createPortal(card, document.querySelector('.mk-body') ?? document.body) : card
}
