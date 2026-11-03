// The small icon a table's tab wears in its section's strip. A section opts in by naming its tabs here.
import { Globe, Layers, Monitor, Smartphone, Tablet, Wifi, type LucideIcon } from 'lucide-react'
import type { Tab } from './types'

export const TAB_ICONS: Partial<Record<Tab, LucideIcon>> = {
  devices: Smartphone,
  browsers: Globe,
  networks: Wifi,
  bversion: Layers,
  screens: Monitor,
}

const DEVICE_ICONS: Record<string, LucideIcon> = { desktop: Monitor, mobile: Smartphone, tablet: Tablet }

/** The icon of a device row (desktop, mobile, tablet), if it is one of those. */
export const deviceIcon = (val: string): LucideIcon | undefined => DEVICE_ICONS[val.toLowerCase()]
