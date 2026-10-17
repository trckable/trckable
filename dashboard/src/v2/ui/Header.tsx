// The header, one row: the ghost (all sites), the site and its setup ring, Live | Briefing, the period, and on the right ⌘K, the plan, the bell and the
// person. Nothing else lives here: no filters, no share, no second row. A phone keeps the site and the person; the
// period moves into the page, and the switch into the bar at the bottom.
import { useEffect, useState, type ReactNode } from 'react'
import { ghostSvg } from '../../brand/logo'
import '../../brand/logo.css'

/** The brand's ghost (src/brand), the one mark everywhere: it floats on hover like the logo does. */
export function Logo({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <span
      className="logo tkb-logo"
      id="logo"
      role="link"
      tabIndex={0}
      aria-label={title}
      title={title}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      dangerouslySetInnerHTML={{ __html: ghostSvg(30) }}
    />
  )
}

export function ExploreChip({ onClick, label, kbd }: { onClick: () => void; label: string; kbd: string }) {
  return (
    <button type="button" className="mk-chip exb" title={label} onClick={onClick}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
      <span className="t2">{label}</span>
      <span className="mk-kbd">{kbd}</span>
    </button>
  )
}

interface HeaderProps {
  logo: ReactNode
  site: ReactNode
  /** The setup ring, right of the site. */
  ring?: ReactNode
  views: ReactNode
  period: ReactNode
  explore: ReactNode
  account: ReactNode
  /** Between ⌘K and the bell: a build with a plan puts its chip here (see ../slots). */
  extras?: ReactNode
  bell?: ReactNode
  /** Buttons for the page's keys, out of sight (the header is what they sit in). */
  keys?: ReactNode
}

/** Whether the page has moved under the header (its bottom edge shows then). */
function useStuck(): boolean {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const on = () => setStuck(window.scrollY > 0)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return stuck
}

export function Header(p: HeaderProps) {
  const stuck = useStuck()
  return (
    <header className="hd" data-stuck={stuck}>
      {p.logo}
      <div>{p.site}</div>
      {p.ring}
      {p.views}
      {p.period}
      <span className="sp" />
      {p.explore}
      {p.extras}
      {p.bell}
      {p.account}
      {p.keys}
    </header>
  )
}
