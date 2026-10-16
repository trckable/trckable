// The header, one row: the ghost (all sites), the site, Live | Briefing, the period, and on the right Explore, the
// person. Nothing else lives here: no filters, no share, no second row. A phone keeps the site and the person; the
// period moves into the page, and the switch into the bar at the bottom.
import type { ReactNode } from 'react'

export function Logo({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <svg className="logo" id="logo" viewBox="0 0 40 40" role="link" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <title>{title}</title>
      <path d="M8 26c0-9 5-16 12-16s12 7 12 16c-2 2-4 0-6 2s-4 0-6 2-4 0-6-2-4 0-6-2z" fill="var(--mk-lime)" />
      <circle cx="16" cy="20" r="2.4" fill="var(--mk-bg)" />
      <circle cx="24" cy="20" r="2.4" fill="var(--mk-bg)" />
      <path d="M5 31c4-3 8 1 12-1s8 2 12-1 6 0 7 1" stroke="var(--mk-lime)" strokeWidth="2" fill="none" />
    </svg>
  )
}

export function ExploreChip({ onClick, label, kbd }: { onClick: () => void; label: string; kbd: string }) {
  return (
    <button type="button" className="chip exb" title={label} onClick={onClick}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
      <span className="t2">{label}</span>
      <span className="kbd">{kbd}</span>
    </button>
  )
}

export interface HeaderProps {
  logo: ReactNode
  site: ReactNode
  views: ReactNode
  period: ReactNode
  explore: ReactNode
  account: ReactNode
}

export function Header(p: HeaderProps) {
  return (
    <header className="hd">
      {p.logo}
      <div>{p.site}</div>
      {p.views}
      {p.period}
      <span className="sp" />
      {p.explore}
      {p.account}
    </header>
  )
}
