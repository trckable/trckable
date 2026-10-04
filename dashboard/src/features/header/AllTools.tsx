// The header's end on All sites: the same avatar menu as a site's page has
// (HeaderTools), without the tools that belong to one site.
import { AccountMenu } from '../../components/AccountMenu'
import { useKeymap } from '../../lib/keys'
import { isShared } from '../../lib/me'

export function AllTools() {
  useKeymap()
  return (
    <div className="header-tools quiet">
      <div className="spacer" />
      {!isShared() && <AccountMenu />}
    </div>
  )
}
