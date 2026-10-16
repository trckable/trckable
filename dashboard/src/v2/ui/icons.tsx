// The line icons of the walkthrough: one 24 x 24 box, 1.7 stroke, round ends.
import type { CSSProperties, ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  uptime: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  sales: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M14.5 9.6c0-1-1.1-1.6-2.5-1.6s-2.5.6-2.5 1.6 1.1 1.4 2.5 1.7 2.5.7 2.5 1.7-1.1 1.6-2.5 1.6-2.5-.6-2.5-1.6" />
    </>
  ),
  sources: <path d="M4 12h12M12 6l6 6-6 6" />,
  funnel: <path d="M4 5h16l-6 8v6l-4-2v-4z" />,
  countries: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" />
    </>
  ),
  devices: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  pages: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
    </>
  ),
  goals: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  setup: <path d="M12 3v6M8 9h8v4a4 4 0 0 1-8 0zM12 17v4" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  speed: <path d="M4 16a8 8 0 1 1 16 0M12 16l4-5" />,
  people: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3 19c0-3 3-5 6-5s6 2 6 5M16 6a3 3 0 0 1 0 6M17 14c2 .5 4 2 4 5" />
    </>
  ),
  goal: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  leave: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  cart: (
    <>
      <path d="M4 5h2l2 10h9l2-7H7" />
      <circle cx="10" cy="19" r="1" />
      <circle cx="17" cy="19" r="1" />
    </>
  ),
  click: <path d="M5 4l4 14 3-6 6-3z" />,
  spark: <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />,
  mentions: <path d="M5 6h14v9H10l-4 3v-3H5z" />,
  chev: <path d="M9 6l6 6-6 6" />,
  overview: <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" />,
  places: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" />
    </>
  ),
  tech: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  results: <path d="M4 5h16l-6 8v6l-4-2v-4z" />,
  links: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  milestone: <path d="M6 21V4M6 5h11l-2 4 2 4H6" />,
}

export type IconName = keyof typeof PATHS

export function Ico({ name, className, strokeWidth = 1.7, style }: { name: string; className?: string; strokeWidth?: number; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] ?? PATHS.pages}
    </svg>
  )
}
