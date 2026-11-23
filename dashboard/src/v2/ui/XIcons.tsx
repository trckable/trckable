// Explore's section icons: the same 24 box and round line as the walkthrough's, one per section.
import type { CSSProperties, ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  changed: <path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3" />,
  overview: <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" />,
  pages: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
    </>
  ),
  sources: <path d="M4 6h4l8 12h4M4 18h4l2.5-3.8M13.5 9.8 16 6h4M18 3l3 3-3 3M18 15l3 3-3 3" />,
  places: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" />
    </>
  ),
  speed: <path d="M4 16a8 8 0 1 1 16 0M12 16l4-5" />,
  ai: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z" />,
  goals: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
}

// The sections that took a name of their own wear the picture of the one they grew from.
PATHS.audience = PATHS.places
PATHS.health = PATHS.speed
PATHS.web = PATHS.ai

/** A section's icon; `xi` is the size and colour the toolbar and the picker give it. */
export function XIco({ name, className = 'xi', style }: { name: string; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className || undefined} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] ?? PATHS.pages}
    </svg>
  )
}
