// Explore's section icons: the same 24 box and round line as the walkthrough's, one per section.
import type { CSSProperties, ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  ai: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z" />,
  overview: <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" />,
  pages: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
    </>
  ),
  sources: <path d="M4 12h12M12 6l6 6-6 6" />,
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
  sales: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M14.5 9.6c0-1-1.1-1.6-2.5-1.6s-2.5.6-2.5 1.6 1.1 1.4 2.5 1.7 2.5.7 2.5 1.7-1.1 1.6-2.5 1.6-2.5-.6-2.5-1.6" />
    </>
  ),
  speed: <path d="M4 16a8 8 0 1 1 16 0M12 16l4-5" />,
  mentions: <path d="M4 5h16v11H9l-5 4z" />,
  links: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  uptime: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  goals: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3 19c0-3 3-5 6-5s6 2 6 5M16 6a3 3 0 0 1 0 6M17 14c2 .5 4 2 4 5" />
    </>
  ),
  click: <path d="M5 4l4 14 3-6 6-3z" />,
  leave: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  goal: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
}

/** A section's icon; `xi` is the size and colour the toolbar and the picker give it. */
export function XIco({ name, className = 'xi', style }: { name: string; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className || undefined} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] ?? PATHS.pages}
    </svg>
  )
}

/** The little chevron of the rail's collapse button. */
export function XChev({ right }: { right: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={right ? 'M6 3.5 10.5 8 6 12.5' : 'M10 3.5 5.5 8l4.5 4.5'} />
    </svg>
  )
}
