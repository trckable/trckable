// What a device is called, from its kind and its system: iPhone, iPad, Mac, Android phone, Android tablet, Windows PC,
// Linux, or Other. One list for the visitor window and the Live Analytics card.
import { copy } from '../features/journey/copy'

export type DeviceKey = 'iphone' | 'ipad' | 'mac' | 'androidPhone' | 'androidTablet' | 'windowsPc' | 'linux' | 'otherDevice'

export function deviceKey(device: string | undefined, os: string | undefined): DeviceKey {
  const o = (os ?? '').toLowerCase()
  const kind = (device ?? '').toLowerCase()
  const tablet = kind === 'tablet'
  if (o === 'ios' || o === 'ipados') return tablet ? 'ipad' : 'iphone'
  if (o.startsWith('mac')) return 'mac'
  if (o === 'android') return tablet ? 'androidTablet' : 'androidPhone'
  if (o.startsWith('windows') && kind === 'desktop') return 'windowsPc'
  if (o.startsWith('linux') && kind === 'desktop') return 'linux'
  return 'otherDevice'
}

/** The name of a device key. */
export const deviceLabel = (key: DeviceKey): string => copy[key]

/** The device by its own name when the system tells it; else the device kind (or "Other" with no kind). */
export function deviceName(who: { device?: string; os?: string }): string {
  const key = deviceKey(who.device, who.os)
  return key === 'otherDevice' ? who.device || copy.otherDevice : deviceLabel(key)
}
