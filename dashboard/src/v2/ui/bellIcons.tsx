import type { ReactNode } from 'react'

/** The bell row icons, one path per kind; unknown kinds use the weekly one. */
export const BELL_PATH: Record<string, ReactNode> = {
  down: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  up: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  spike: <path d="M4 18l5-6 4 3 7-9" />,
  sale: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10c0-1 1-1.6 2.5-1.6s2.5.6 2.5 1.6-1 1.4-2.5 1.6-2.5.7-2.5 1.7 1 1.6 2.5 1.6 2.5-.6 2.5-1.6" />
    </>
  ),
  failed: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5M12 16v.5" />
    </>
  ),
  mention: <path d="M5 6h14v9H10l-4 3v-3H5z" />,
  milestone: <path d="M6 21V4M6 5h11l-2 4 2 4H6" />,
  plan: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M14.5 9.6c0-1-1.1-1.6-2.5-1.6s-2.5.6-2.5 1.6 1.1 1.4 2.5 1.7 2.5.7 2.5 1.7-1.1 1.6-2.5 1.6-2.5-.6-2.5-1.6" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3 19c0-3 3-5 6-5s6 2 6 5M16 6a3 3 0 0 1 0 6" />
    </>
  ),
  answer: (
    <>
      <path d="M9 10h.01M15 10h.01" />
      <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
    </>
  ),
  weekly: <path d="M7 3h7l4 4v14H7z M14 3v4h4" />,
}

