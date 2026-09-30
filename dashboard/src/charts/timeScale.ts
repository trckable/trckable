// The main chart's arithmetic: bucket labels, its three-label axis and its
// peak. No React, so each is tested on its own (timeScale.test.ts).
import type { Bucket } from '../lib/api'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function bucketLabel(t: string, bucket: Bucket, long = false): string {
  if (!t) return ''
  const d = new Date(t + ':00Z')
  const md = `${months[d.getUTCMonth()]} ${d.getUTCDate()}`
  switch (bucket) {
    case 'hour':
      if (long) return `${days[d.getUTCDay()]}, ${md} · ${t.slice(11, 16)}`
      // Midnight names the day, so hours across several days say which.
      return t.slice(11, 16) === '00:00' ? md : t.slice(11, 16)
    case 'day':
      return long ? `${days[d.getUTCDay()]}, ${md}` : md
    case 'week':
      return long ? `Week of ${md}, ${d.getUTCFullYear()}` : md
    case 'month':
      return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  }
}

/** Three labels on the y-axis, 0, half and top, all round: the top is twice
 *  a step of 1/2/2.5/5/7.5 × 10^k, just above the highest value. */
export function threeScale(v: number): { max: number; step: number } {
  const need = Math.max(2, v * 1.04) / 2
  const pow = Math.pow(10, Math.floor(Math.log10(need)))
  for (const m of [1, 2, 2.5, 5, 7.5, 10]) {
    if (m * pow >= need) return { max: 2 * m * pow, step: m * pow }
  }
  return { max: 20 * pow, step: 10 * pow }
}

/** The same for numbers that are fractions (a rate, 0.03): a thousandth is the finest step, where a count's is one. */
export function fractionScale(v: number): { max: number; step: number } {
  const s = threeScale(v * 1000)
  return { max: s.max / 1000, step: s.step / 1000 }
}

/** The busiest point, or -1 when nothing happened: the one label the chart
 *  writes on its line. The last of equal peaks, as it is the newest. */
export function peakIndex(values: number[]): number {
  let at = -1
  let top = 0
  values.forEach((v, i) => {
    if (v > 0 && v >= top) {
      top = v
      at = i
    }
  })
  return at
}

/** How many buckets apart the x labels sit. By the hour, a step that divides
 *  a day, so every day's midnight (its name) gets a label. */
export function everyNth(step: number, bucket: Bucket): number {
  if (bucket !== 'hour') return step
  return [1, 2, 3, 4, 6, 12, 24, 48].find((n) => n >= step) ?? step
}
