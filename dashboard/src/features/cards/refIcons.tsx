// A small picture before each referring site: its own icon when this server has
// fetched one, else the site's first letter in a tile (useRowExtras asks).
import './refIcons.css'

/** The icon, or the initial; the same size either way, so the row never moves when the picture arrives. */
export function RefMark({ host, icon }: { host: string; icon: boolean }) {
  if (icon) return <img className="ref-mark" src={`/api/v1/referrer-icons/${encodeURIComponent(host)}`} width={16} height={16} alt="" loading="lazy" />
  return (
    <span className="ref-mark ref-initial" aria-hidden="true">
      {host.replace(/^www\./, '').charAt(0).toUpperCase()}
    </span>
  )
}
