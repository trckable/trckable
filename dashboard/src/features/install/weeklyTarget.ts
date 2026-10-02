import type { Alert } from '../../lib/api'

/** The destination for a weekly email: the alert's own, another alert's, or the owner's address. */
export function destination(list: Alert[], mail: boolean, email: string): string {
  const own = list.find((a) => a.kind === 'weekly')?.target || list.find((a) => a.target)?.target
  if (own) return own
  return mail && email ? 'mailto:' + email : ''
}
