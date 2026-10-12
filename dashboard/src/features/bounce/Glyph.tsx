// The mark of a channel in the guide's pictures: its glyph in the channel's colour, in a tinted tile.
import { ArrowUpRight, Link2, Mail, Monitor, Search, Smartphone, Sparkles, Tablet, Target, Users, type LucideIcon } from 'lucide-react'
import { channelColor } from '../../lib/palette'

const GLYPH: Record<string, LucideIcon> = { Direct: ArrowUpRight, Search, Social: Users, Referral: Link2, AI: Sparkles, Email: Mail, Paid: Target }

export function Glyph({ channel, size }: { channel: string; size: number }) {
  const Icon = GLYPH[channel] ?? Link2
  const color = channelColor(channel || 'Direct')
  return (
    <span className="bg-glyph" style={{ width: size, height: size, color, background: `color-mix(in srgb, ${color} 16%, transparent)` }} aria-hidden="true">
      <Icon size={Math.round(size * 0.55)} strokeWidth={1.9} />
    </span>
  )
}

const DEVICE: Record<string, LucideIcon> = { mobile: Smartphone, tablet: Tablet }

/** A phone, a tablet or a screen, by the device's name. */
export function DeviceMark({ device, size }: { device: string; size: number }) {
  const Icon = DEVICE[device.toLowerCase()] ?? Monitor
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />
}
