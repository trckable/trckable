// A small "open site" link on a row: the site's own address in a new tab. It
// sits beside the row's button (never inside it) and does not switch sites.
import { ArrowUpRight } from 'lucide-react'
import { copy } from './menuCopy'

/** Opens a site's address in a new tab (Shift + Enter on a row does the same). */
export function openSiteTab(domain: string) {
  window.open(`https://${domain}`, '_blank', 'noopener,noreferrer')
}

export function OpenSite({ domain }: { domain: string }) {
  if (!domain) return null
  const label = copy.openSite(domain)
  return (
    <a className="site-open" href={`https://${domain}`} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} onClick={(e) => e.stopPropagation()}>
      <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
    </a>
  )
}
