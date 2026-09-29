// The picture you chose, or your initial. Both live on this server: no
// avatar service is ever asked about your email address.
import type { Profile } from '../lib/api'

export function PersonAvatar({ p, email, v = 0, size }: { p: Profile | null; email?: string; v?: number; size?: 'small' | 'big' | 'huge' }) {
  return (
    <span className={'avatar' + (size ? ' ' + size : '')} aria-hidden="true">
      {p?.has_avatar ? <img src={`/api/v1/account/avatar?v=${v}`} alt="" /> : (p?.name || p?.email || email || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}
