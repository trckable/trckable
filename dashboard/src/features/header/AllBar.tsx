// All sites' header row: the logo and site list, and at its end the same
// avatar menu a site's page has (HeaderTools), without the tools that belong
// to one site.
import type { ReactNode } from 'react'
import { AccountMenu } from '../../components/AccountMenu'
import { HeaderBand } from './HeaderBand'
import { useKeymap } from '../../lib/keys'
import { isShared } from '../../lib/me'

export function AllBar({ header }: { header: ReactNode }) {
  useKeymap()
  return (
    <HeaderBand>
    <div className="header quiet">
      {header}
      <div className="header-tools quiet">
        <div className="spacer" />
        {!isShared() && <AccountMenu />}
      </div>
    </div>
    </HeaderBand>
  )
}
