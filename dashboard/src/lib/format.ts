const nf = new Intl.NumberFormat('en-US')
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export const fmtInt = (n: number) => nf.format(Math.round(n))
export const fmtCompact = (n: number) => (Math.abs(n) < 10_000 ? fmtInt(n) : compact.format(n))
export const fmtPct = (x: number) => (x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0) + '%'

export function fmtDuration(s: number) {
  s = Math.round(s)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export interface Delta {
  text: string
  tone: 'up' | 'down' | 'flat'
  label: string
}

/** Change vs the comparison period. `invert` for metrics where lower is better. */
export function delta(cur: number, prev: number | undefined, invert = false): Delta | null {
  if (prev === undefined) return null
  // Nothing before: not a percentage (it would be infinite), just "new".
  if (prev === 0) return cur === 0 ? { text: '0%', tone: 'flat', label: 'no change' } : { text: 'new', tone: 'flat', label: 'new' }
  const d = (cur - prev) / prev
  const flat = Math.abs(d) < 0.005
  const good = invert ? d < 0 : d > 0
  const pct = Math.abs(d * 100)
  // Arrow and sign both, so it reads without the colour.
  const text = (d >= 0 ? '↑ +' : '↓ −') + (pct >= 10 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)) + '%'
  const dir = good ? 'up' : 'down'
  return { text, tone: flat ? 'flat' : dir, label: `${d >= 0 ? 'up' : 'down'} ${pct.toFixed(1)} percent` }
}

const countryNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    return null
  }
})()

export function countryName(code: string) {
  if (!code || code.length !== 2) return code || 'Unknown'
  try {
    return countryNames?.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

export function flag(code: string) {
  if (!code || code.length !== 2) return ''
  const up = code.toUpperCase()
  return String.fromCodePoint(0x1f1a5 + up.charCodeAt(0), 0x1f1a5 + up.charCodeAt(1))
}

const moneyFmt = new Map<string, Intl.NumberFormat>()

/** Formats minor units of a currency: fmtMoney(123456, 'USD', 2) → "$1,234.56". */
export function fmtMoney(minor: number, currency: string, exponent: number, opts: { cents?: boolean } = {}): string {
  const major = minor / Math.pow(10, exponent)
  const cents = opts.cents ?? Math.abs(major) < 100
  const key = currency + (cents ? ':c' : '')
  let f = moneyFmt.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: cents ? exponent : 0, minimumFractionDigits: cents ? Math.min(exponent, 2) : 0 })
    } catch {
      f = new Intl.NumberFormat('en-US', { maximumFractionDigits: cents ? 2 : 0 })
    }
    moneyFmt.set(key, f)
  }
  return f.format(major)
}
