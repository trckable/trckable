// The picture someone chose, or their initial. Both live on this server: no
// avatar service is ever asked about an email address. Your own picture is
// /account/avatar; another person's is asked by id (people of your account only).
import type { Profile } from '../lib/api'

type Who = Pick<Profile, 'email' | 'name' | 'has_avatar'>

interface Props {
  p: Who | null
  email?: string
  /** Someone else's id; leave out for your own picture. */
  id?: string
  v?: number
  size?: 'small' | 'big' | 'huge'
  className?: string
}

export function PersonAvatar({ p, email, id, v = 0, size, className }: Props) {
  const src = id ? `/api/v1/people/${encodeURIComponent(id)}/avatar` : '/api/v1/account/avatar'
  const classes = ['avatar', size, className].filter(Boolean).join(' ')
  return (
    <span className={classes} aria-hidden="true">
      {p?.has_avatar ? <img src={`${src}?v=${v}`} alt="" /> : (p?.name || p?.email || email || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}
