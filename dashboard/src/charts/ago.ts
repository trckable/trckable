// How long ago a chart bucket was, for the pill under the axis.

/** "today", "yesterday", "12 days ago" — the same words people use. */
export function ago(t: string): string {
  if (!t) return ''
  const then = new Date(t + ':00Z').getTime()
  const days = Math.round((Date.now() - then) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 45) return `${days} days ago`
  const months = Math.round(days / 30)
  return months < 24 ? `${months} months ago` : `${Math.round(days / 365)} years ago`
}
