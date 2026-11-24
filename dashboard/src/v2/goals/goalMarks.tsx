// The small pictures a goal is told with, so a row reads at a glance: an icon for the kind of goal, a mark for who sent them, the
// country's flag and the device. Each carries its words as a title and a label. One map of kinds, with a default.
import { createElement } from 'react'
import { ClipboardList, Download, ExternalLink, FileText, Monitor, MousePointerClick, Play, ScanLine, ShoppingCart, Smartphone, Tablet, Target, UserPlus, type LucideIcon } from 'lucide-react'
import { SourceMark } from '../../components/visitor/SourceMark'
import { deviceKey, deviceName, type DeviceKey } from '../../lib/deviceName'
import { countryName } from '../../lib/format'
import { Flag, flagSrc } from '../ui/Flag'
import { sourceWords } from './standing'
import './standing.css'

/** What a goal's key says it is, first match wins; a goal reached by seeing a page is a page visit. */
const KINDS: [RegExp, LucideIcon][] = [
  [/outbound/, ExternalLink],
  [/form|submit/, ClipboardList],
  [/sign[-_ ]?up|signed|register|join/, UserPlus],
  [/download/, Download],
  [/buy|purchase|checkout|order|cart/, ShoppingCart],
  [/scan/, ScanLine],
  [/start|trial|play|demo/, Play],
  [/click|tap|press|button/, MousePointerClick],
]

export function goalIcon(g: { goal: string; page?: boolean }): LucideIcon {
  if (g.page) return FileText
  const key = g.goal.toLowerCase()
  return KINDS.find(([re]) => re.test(key))?.[1] ?? Target
}

/** The icon of a goal's kind, in a soft square. */
export function GoalGlyph({ g, size = 14 }: { g: { goal: string; page?: boolean }; size?: number }) {
  return (
    <span className="gs-glyph" aria-hidden="true">
      {createElement(goalIcon(g), { size })}
    </span>
  )
}

/** Who sent them: the site's own mark, or the channel's. */
export function SourceIcon({ source }: { source?: string }) {
  const words = sourceWords(source)
  const host = source?.includes('.') ? source : undefined
  return (
    <span className="gs-ico" title={words} role="img" aria-label={words}>
      <SourceMark channel={host ? 'Referral' : source || 'Direct'} referrer={host} size={18} />
    </span>
  )
}

/** The country's flag; its code where there is no flag. */
export function PlaceIcon({ country }: { country?: string }) {
  if (!country) return <span className="gs-ico" />
  const name = countryName(country)
  return (
    <span className="gs-ico" title={name} role="img" aria-label={name}>
      {flagSrc(country) ? <Flag code={country} width={18} /> : <span className="gs-cc">{country}</span>}
    </span>
  )
}

const DEVICE_ICON: Record<DeviceKey, LucideIcon> = {
  iphone: Smartphone,
  androidPhone: Smartphone,
  ipad: Tablet,
  androidTablet: Tablet,
  mac: Monitor,
  windowsPc: Monitor,
  linux: Monitor,
  otherDevice: Monitor,
}

export function DeviceIcon({ device, os }: { device?: string; os?: string }) {
  const name = deviceName({ device, os })
  const Icon = DEVICE_ICON[deviceKey(device, os)]
  return (
    <span className="gs-ico gs-dev" title={name} role="img" aria-label={name}>
      <Icon size={15} />
    </span>
  )
}
