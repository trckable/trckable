// A small "open site" link on a row: the site's own address in a new tab. It
// sits beside the row's button (never inside it) and does not switch sites.
// The arrow is drawn here (lucide's ArrowUpRight) so it adds no chunk of its own.
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 7h10v10M7 17 17 7" />
      </svg>
    </a>
  )
}
