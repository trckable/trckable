import type { Period } from './api'

const DAY = 86400

/** The shortest period the server offers that reaches back to the chart's first day. */
export function periodFor(labels: string[], now: number): Period {
  const days = labels.length ? (now - Date.parse(labels[0].slice(0, 10)) / 1000) / DAY : 0
  if (days <= 30) return '30d'
  return days <= 90 ? '90d' : '1y'
}
