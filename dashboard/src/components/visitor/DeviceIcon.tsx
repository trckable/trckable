// The kind of device a visit came from, as an icon. Decorative: whoever
// shows it also shows (or labels) the device's name.
import { Monitor, MonitorSmartphone, Smartphone, Tablet, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  mobile: Smartphone,
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
}

export function DeviceIcon({ device, size = 14 }: { device: string; size?: number }) {
  const Glyph = ICONS[device.toLowerCase()] ?? MonitorSmartphone
  return <Glyph size={size} strokeWidth={1.9} aria-hidden="true" />
}
