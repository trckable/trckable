// The Connect control of a platform: a link to the server's start address, or, where the server has no app keys for it, a
// disabled button beside a link to how to set it up. Only someone who may connect sees it.
import { Link2 } from 'lucide-react'
import { can } from '../../lib/permissions'
import { startUrl, type Platform } from './api'
import { copy } from './copy'

export function Connect({ platform, ready, className = 'btn' }: { platform: Platform; ready: boolean; className?: string }) {
  if (!can('channels.connect')) return null
  const label = copy.connect(copy.platform[platform])
  if (ready) {
    return (
      <a className={className} href={startUrl(platform)}>
        <Link2 size={16} aria-hidden="true" />
        {label}
      </a>
    )
  }
  return (
    <span className="ch-off">
      <button type="button" className={className} disabled title={copy.notSetUp}>
        <Link2 size={16} aria-hidden="true" />
        {label}
      </button>
      <a href={copy.docs} target="_blank" rel="noreferrer" className="ch-doc">
        {copy.setUp}
      </a>
    </span>
  )
}
