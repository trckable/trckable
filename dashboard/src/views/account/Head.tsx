// The account window's header: picture, name, email, a small role pill, close.
import { X } from 'lucide-react'
import { PersonAvatar } from '../../components/PersonAvatar'
import { closeAccount } from '../../lib/account'
import type { Profile } from '../../lib/api'
import { isViewer } from '../../lib/me'
import { copy } from './copy'

export function AccountHead({ profile, email, v }: { profile: Profile | null; email?: string; v: number }) {
  const viewer = isViewer()
  return (
    <header className="account-head">
      <PersonAvatar p={profile} email={email} v={v} size="big" />
      <span className="account-who">
        <span className="account-name">
          <b>{profile?.name || email?.split('@')[0]}</b>
          <span className={'tag account-role' + (viewer ? ' quiet' : ' on')}>{viewer ? copy.viewer : copy.owner}</span>
        </span>
        <span className="account-email">{email}</span>
      </span>
      <button type="button" className="btn icon close" aria-label="Close" onClick={closeAccount}>
        <X size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </header>
  )
}
