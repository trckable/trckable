// Where a visit came from, as a small mark: the site that sent them as a
// monogram in the channel's colour, or the channel's own glyph when no site
// did. Favicons would need a fetch to a third party from the dashboard, which
// the content policy (and the privacy promise) rules out.
import { ArrowUpRight, Link2, Mail, Megaphone, Search, Sparkles, Target, Users, type LucideIcon } from 'lucide-react'
import { channelColor } from '../../lib/palette'
import './visitor.css'

const ICONS: Record<string, LucideIcon> = {
  Direct: ArrowUpRight,
  Search: Search,
  Social: Users,
  Referral: Link2,
  AI: Sparkles,
  Email: Mail,
  Paid: Megaphone,
}

/** The letter a domain is known by: "www.google.com" → "G". */
export function monogram(domain: string): string {
  const bare = domain.replace(/^www\./, '')
  return (bare.match(/[\p{L}\p{N}]/u)?.[0] ?? '').toUpperCase()
}

// A phone draws the mark a step larger (--ph-mark in phone.css; 1 elsewhere).
const scaled = (px: number) => `calc(${px}px * var(--ph-mark, 1))`

export function SourceMark({ channel, referrer, goal = false, size = 28 }: { channel: string; referrer?: string; goal?: boolean; size?: number }) {
  const color = goal ? 'var(--accent)' : channelColor(channel || 'Direct')
  const letter = !goal && referrer ? monogram(referrer) : ''
  const style = { width: scaled(size), height: scaled(size), color, ['--v-ring' as string]: color }
  if (letter) {
    return (
      <span className="v-mark letter" style={{ ...style, fontSize: `max(var(--ph-mark-min, 0px), ${scaled(Math.round(size * 0.46))})` }} aria-hidden="true">
        {letter}
      </span>
    )
  }
  const Glyph = goal ? Target : (ICONS[channel] ?? Link2)
  return (
    <span className="v-mark" style={style} aria-hidden="true">
      <Glyph size={Math.round(size * 0.55)} strokeWidth={1.9} />
    </span>
  )
}
