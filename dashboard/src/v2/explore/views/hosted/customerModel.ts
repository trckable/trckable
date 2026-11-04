// What a customer's sheet shows about a license key, worked out from what the provider reported: whether it was used,
// how long after the purchase, and how many devices were added after the first. Plain functions, so the sheet stays dumb.
import type { LicenseKey } from '../../../../features/extras/extrasApi'

export interface DeviceView {
  /** Position in the order of activation, from 1: "Device 1". */
  n: number
  at: number
}

export interface LicenseView {
  last4: string
  /** The provider's own word when it is not one of the three the sheet knows. */
  status: string
  known: boolean
  used: number
  limit?: number
  activated: boolean
  /** Milliseconds from the purchase to the first activation, when both are known. */
  firstAfter?: number
  /** Devices added after the first one. */
  changes: number
  devices: DeviceView[]
}

export const STATUS = ['active', 'disabled', 'expired'] as const

export function licenseView(l: LicenseKey): LicenseView {
  const times = l.activations.map((a) => Date.parse(a)).filter((t) => Number.isFinite(t)).sort((a, b) => a - b)
  const bought = l.created_at ? Date.parse(l.created_at) : NaN
  const activated = l.used > 0 || times.length > 0
  const known = STATUS.some((s) => s === l.status)
  return {
    last4: l.last4,
    status: l.status,
    known,
    used: l.used,
    limit: l.limit || undefined,
    activated,
    firstAfter: times.length > 0 && Number.isFinite(bought) ? Math.max(0, times[0] - bought) : undefined,
    changes: Math.max(0, times.length - 1),
    devices: times.map((at, i) => ({ n: i + 1, at })),
  }
}

export type Span = { unit: 'now' | 'min' | 'hour' | 'day'; n: number }

/** A length of time in the one unit that reads best: under a minute is "now", then minutes, hours, days. */
export function spanOf(ms: number): Span {
  const min = Math.round(ms / 60000)
  if (min < 1) return { unit: 'now', n: 0 }
  if (min < 60) return { unit: 'min', n: min }
  if (min < 1440) return { unit: 'hour', n: Math.round(min / 60) }
  return { unit: 'day', n: Math.round(min / 1440) }
}

/** What a row is called: the provider's name, else "Customer". */
export const customerName = (name: string | undefined, fallback: string) => (name && name.trim() ? name.trim() : fallback)
