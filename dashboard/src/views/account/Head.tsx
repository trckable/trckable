// The account window's head: picture, name, email and a small role pill. The
// close button is the window's own.
import { PersonAvatar } from '../../components/PersonAvatar'
import type { Profile } from '../../lib/api'
import { isViewer } from '../../lib/me'
import { copy } from './copy'

export function AccountHead({ profile, email, v }: { profile: Profile | null; email?: string; v: number }) {
  const viewer = isViewer()
  return (
    <>
      <PersonAvatar p={profile} email={email} v={v} size="big" />
      <span className="window-who">
        <span className="window-name">
          <b>{profile?.name || email?.split('@')[0]}</b>
          <span className={'tag account-role' + (viewer ? ' quiet' : ' on')}>{viewer ? copy.viewer : copy.owner}</span>
        </span>
        <span className="window-sub">{email}</span>
      </span>
    </>
  )
}
