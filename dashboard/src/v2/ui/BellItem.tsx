// One row of the bell's list: the unread dot, the icon (the source's own mark with the kind as a badge on its corner, or the
// kind's icon when nothing sent it), the title (one line, two at most), a short line under it, and its menu.
import { ArrowUpRight, Check, Flag, MessageSquare } from 'lucide-react'
import type { ReactNode } from 'react'
import { SourceMark } from '../../components/visitor/SourceMark'
import { BELL_PATH } from './bellIcons'
import { RowMenu } from './BellPopovers'
import type { BellProps, BellRow } from './BellMenu'

/** The small mark on the corner of a source's icon: what kind of moment it was, in the moment's tone. */
const BADGE: Record<string, { tone: string; glyph: ReactNode } | undefined> = {
  spike: { tone: 'up', glyph: <ArrowUpRight size={9} strokeWidth={3} aria-hidden="true" /> },
  down: { tone: 'down', glyph: <i className="nfb-dot" /> },
  up: { tone: 'ok', glyph: <Check size={9} strokeWidth={3} aria-hidden="true" /> },
  milestone: { tone: 'up', glyph: <Flag size={9} strokeWidth={2.6} aria-hidden="true" /> },
  mention: { tone: 'up', glyph: <MessageSquare size={9} strokeWidth={2.6} aria-hidden="true" /> },
}

function KindIcon({ kind }: { kind: string }) {
  return (
    <svg className={`nfi k-${kind}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {BELL_PATH[kind] ?? BELL_PATH.weekly}
    </svg>
  )
}

function Icon({ n }: { n: BellRow }) {
  if (!n.source) return <KindIcon kind={n.kind} />
  const badge = BADGE[n.kind]
  return (
    <span className="nfm">
      <SourceMark channel="Referral" referrer={n.source} size={30} />
      {badge && <span className={`nfb ${badge.tone}`}>{badge.glyph}</span>}
    </span>
  )
}

export function Row({ n, p, close }: { n: BellRow; p: BellProps; close: () => void }) {
  const pick = (id: string) => {
    p.onPick(id)
    close()
  }
  const under = [n.sub, n.time].filter(Boolean).join(' · ')
  const dot = <i className={`nfd${n.unread ? '' : ' off'}`} aria-hidden="true" />
  return (
    <div className="nfw" data-id={n.id}>
      {n.lines ? (
        <div className={`nf grp ${n.unread ? 'unread' : ''}`}>
          {dot}
          <KindIcon kind={n.kind} />
          <span className="nft">
            <b>{n.title}</b>
            {n.lines.map((l) => (
              <button key={l.id} type="button" className="nfn" onClick={() => pick(l.id)}>
                {l.text}
              </button>
            ))}
            {under && <small>{under}</small>}
          </span>
        </div>
      ) : (
        <button type="button" className={`nf ${n.unread ? 'unread' : ''}${n.bad ? ' bad' : ''}`} aria-label={n.label} onClick={() => pick(n.id)}>
          {dot}
          <Icon n={n} />
          <span className="nft">
            <b>{n.title}</b>
            {under && <small>{under}</small>}
          </span>
        </button>
      )}
      <RowMenu row={n} close={close} />
    </div>
  )
}
