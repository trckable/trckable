import { defineCopy, intl, tag } from '../i18n'
import { overCap } from './thin'
import { times, timesNum } from './times'

export { times, timesNum }

// Numbers, money and names follow the language: English keeps the US form it always had.
const loc = tag ?? 'en-US'
const nf = new Intl.NumberFormat(loc)
const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 })
const words = defineCopy('format', {
  change: (up: boolean, pct: string) => `${up ? 'up' : 'down'} ${pct} percent`,
  capped: 'up more than 10 times',
  ago: {
    now: 'just now',
    minutes: (n: number) => `${n} min ago`,
    hours: (n: number) => `${n} h ago`,
    yesterday: 'yesterday',
    days: (n: number) => `${n} days ago`,
  },
})

/** A move smaller than this share is flat: it rounds to nothing worth a colour. The server's reports use the same (reports.MoveFlat). */
export const FLAT = 0.005
/** A site is busier or quieter than usual from this share on (All sites). */
export const MOVE = 0.15

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

/** Seconds as people say a stretch of time that was lost or watched: 45m, 3h 12m, 2d 4h. (A visit's length is fmtDuration.) */
export function fmtSpan(secs: number): string {
  const s = Math.max(0, Math.round(secs))
  if (s < 60) return '<1m'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`
}

/** How far cur is from prev as a share of prev, in the percentage a person reads: one decimal under 10, whole from 10 on ("3.4", "12"). Locale separators. */
export const fmtMove = (change: number): string => {
  const pct = Math.abs(change * 100)
  return fmtFixed(pct, pct >= 10 || pct === 0 ? 0 : 1)
}

export interface Move {
  /** Signed change as a share of one: 0.12 is up 12%. */
  change: number
  dir: 'up' | 'down' | 'flat'
  /** The percentage, never negative: "3.4", "12". */
  pct: string
  /** More than ten times the earlier figure (lib/thin): said as "10x+", never as the huge percentage. */
  capped: boolean
}

/**
 * How cur moved against prev. Nothing when there is nothing to compare with: a
 * period with no data before it has no percentage (it would be infinite).
 * Every change on every screen is this, so the same move reads the same.
 */
export function move(cur: number, prev: number | undefined): Move | null {
  if (prev === undefined || !(prev > 0)) return null
  const change = (cur - prev) / prev
  let dir: Move['dir'] = change > 0 ? 'up' : 'down'
  if (Math.abs(change) < FLAT) dir = 'flat'
  return { change, dir, pct: fmtMove(change), capped: change > 0 && overCap(cur, prev) }
}

export interface Delta {
  text: string
  /** The number and its arrow, small: "28% ↑". */
  short: string
  tone: 'up' | 'down' | 'flat'
  label: string
  /** For a number where lower is better: whether this move is the better or the worse one. */
  verdict?: 'better' | 'worse'
}

/**
 * Change vs the comparison period. `invert` for metrics where lower is better.
 * Nothing when there is nothing to compare with (see move).
 */
export function delta(cur: number, prev: number | undefined, invert = false): Delta | null {
  const m = move(cur, prev)
  if (!m) return null
  const flat = m.dir === 'flat'
  const good = invert ? m.change < 0 : m.change > 0
  const d = m.change
  const side = good ? 'up' : 'down'
  return {
    // Arrow and sign both, so it reads without the colour.
    text: m.capped ? '↑ 10x+' : (d >= 0 ? '↑ +' : '↓ −') + m.pct + '%',
    short: m.capped ? '10x+ ↑' : `${m.pct}% ${d >= 0 ? '↑' : '↓'}`,
    tone: flat ? 'flat' : side,
    label: m.capped ? words.capped : words.change(d >= 0, fmtFixed(Math.abs(d * 100), 1)),
    ...(invert && !flat ? { verdict: good ? ('better' as const) : ('worse' as const) } : {}),
  }
}

/** The share of a period a site was up, to one decimal: "99.9". The caller adds the percent sign its sentence has. */
export const fmtUptime = (pct: number) => fmtFixed(pct, 1)

/** How long ago a unix time was, in a few words: "just now", "5 min ago", "2 h ago", "yesterday", "3 days ago". */
export const relativeAgo = (unix: number, now = Date.now() / 1000): string => relativeSince(now - unix)

/** The same for a number of seconds that have passed. */
export function relativeSince(seconds: number): string {
  const s = Math.max(0, seconds)
  if (s < 60) return words.ago.now
  if (s < 3600) return words.ago.minutes(Math.floor(s / 60))
  if (s < 86400) return words.ago.hours(Math.floor(s / 3600))
  const d = Math.floor(s / 86400)
  return d === 1 ? words.ago.yesterday : words.ago.days(d)
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
