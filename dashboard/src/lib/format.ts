import { defineCopy, intl, tag } from '../i18n'

// Numbers, money and names follow the language: English keeps the US form it always had.
const loc = tag ?? 'en-US'
const nf = new Intl.NumberFormat(loc)
const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 })
const words = defineCopy('format', { change: (up: boolean, pct: string) => `${up ? 'up' : 'down'} ${pct} percent` })

/** A number with a fixed count of decimals, in the language's own separators. */
export const fmtFixed = (x: number, digits: number) => (intl.fixed ? intl.fixed(x, digits) : x.toFixed(digits))

/** A share (0.123) as a percentage with up to `digits` decimals, at least `min`: "12.3%", "12,3 %". */
export const fmtRatio = (x: number, digits: number, min = digits) => {
  if (intl.ratio) return intl.ratio(x, digits, min)
  return String(min < digits ? +(x * 100).toFixed(digits) : (x * 100).toFixed(digits)) + '%'
}

export const fmtInt = (n: number) => nf.format(Math.round(n))
export const fmtCompact = (n: number) => (Math.abs(n) < 10_000 ? fmtInt(n) : compact.format(n))
export const fmtPct = (x: number) => fmtRatio(x, x > 0 && x < 0.1 ? 1 : 0)

export function fmtDuration(s: number) {
  s = Math.round(s)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export interface Delta {
  text: string
  /** The number and its arrow, small: "28% ↑". */
  short: string
  tone: 'up' | 'down' | 'flat'
  label: string
}

/**
 * Change vs the comparison period. `invert` for metrics where lower is better.
 * Nothing when there is nothing to compare with: a period with no data before
 * it has no percentage (it would be infinite), and says nothing instead.
 */
export function delta(cur: number, prev: number | undefined, invert = false): Delta | null {
  if (prev === undefined || !(prev > 0)) return null
  const d = (cur - prev) / prev
  const flat = Math.abs(d) < 0.005
  const good = invert ? d < 0 : d > 0
  const pct = Math.abs(d * 100)
  const num = fmtFixed(pct, pct >= 10 || pct === 0 ? 0 : 1)
  const dir = good ? 'up' : 'down'
  return {
    // Arrow and sign both, so it reads without the colour.
    text: (d >= 0 ? '↑ +' : '↓ −') + num + '%',
    short: `${num}% ${d >= 0 ? '↑' : '↓'}`,
    tone: flat ? 'flat' : dir,
    label: words.change(d >= 0, fmtFixed(pct, 1)),
  }
}

const countryNames = (() => {
  try {
    return new Intl.DisplayNames([tag ?? 'en'], { type: 'region' })
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
  const key = `${currency}:${exponent}${cents ? ':c' : ''}`
  let f = moneyFmt.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(loc, { style: 'currency', currency, maximumFractionDigits: cents ? exponent : 0, minimumFractionDigits: cents ? Math.min(exponent, 2) : 0 })
    } catch {
      f = new Intl.NumberFormat(loc, { maximumFractionDigits: cents ? 2 : 0 })
    }
    moneyFmt.set(key, f)
  }
  return f.format(major)
}

const axisFmt = new Map<string, Intl.NumberFormat>()

/** One label on a money axis: the symbol and a short number, "$0", "$50", "$1.5K". */
export function fmtMoneyAxis(minor: number, currency: string, exponent: number): string {
  let f = axisFmt.get(currency)
  if (!f) {
    try {
      f = new Intl.NumberFormat(loc, { style: 'currency', currency, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })
    } catch {
      f = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 })
    }
    axisFmt.set(currency, f)
  }
  return f.format(minor / Math.pow(10, exponent))
}
