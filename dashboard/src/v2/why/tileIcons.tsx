/*
 * Motion icons for the sections grid: each symbol moves by what it means, once per hover.
 * The approach follows lucide-animated (https://lucide-animated.com, MIT, (c) pqoqubbw): lucide-style
 * strokes animated with `motion`, driven from the parent's hover state.
 *
 * MIT License. Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files, to deal in the software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies, subject to the
 * above copyright notice and this permission notice being included in all copies. The software is provided
 * "as is", without warranty of any kind.
 */
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { TargetAndTransition } from 'motion/react'

const ON = { duration: 0.5, ease: 'easeOut' } as const
const OFF = { duration: 0.15 } as const
const mid = { transformBox: 'fill-box', transformOrigin: 'center' } as const
const pivot = (x: number, y: number) => ({ transformBox: 'view-box', transformOrigin: `${x}px ${y}px` }) as const

/** One part of an icon: `on` plays on hover, `off` is the resting pose. */
function Part({ on, off, style, children }: { on: TargetAndTransition; off: TargetAndTransition; style?: object; children: ReactNode }) {
  return (
    <motion.g style={{ ...mid, ...style }} variants={{ on: { ...on, transition: ON }, off: { ...off, transition: OFF } }}>
      {children}
    </motion.g>
  )
}

const Draw = ({ d }: { d: string }) => (
  <motion.path d={d} variants={{ on: { pathLength: [0, 1], transition: { duration: 0.55, ease: 'easeOut' } }, off: { pathLength: 1, transition: OFF } }} />
)

const ICONS: Record<string, ReactNode> = {
  changed: (
    <>
      <Part on={{ y: [0, 3, 0] }} off={{ y: 0 }}><path d="M7 4v14M7 18l-3-3M7 18l3-3" /></Part>
      <Part on={{ y: [0, -3, 0] }} off={{ y: 0 }}><path d="M17 20V6M17 6l-3 3M17 6l3 3" /></Part>
    </>
  ),
  overview: (
    <>
      <path d="M4 19V5M4 19h16" />
      <Draw d="M8 15l3-4 3 2 5-6" />
    </>
  ),
  pages: (
    <>
      <Part on={{ y: [0, -1.5, 0] }} off={{ y: 0 }}><path d="M7 3h7l4 4v14H7z" /></Part>
      <Part on={{ x: [0, 1.2, 0], y: [0, -2.4, 0], rotate: [0, 12, 0] }} off={{ x: 0, y: 0, rotate: 0 }}><path d="M14 3v4h4" /></Part>
    </>
  ),
  sources: (
    <>
      <Draw d="M4 6h4l8 12h4M4 18h4l2.5-3.8M13.5 9.8 16 6h4" />
      <Part on={{ x: [0, 2, 0] }} off={{ x: 0 }}><path d="M18 3l3 3-3 3M18 15l3 3-3 3" /></Part>
    </>
  ),
  places: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16" />
      <Part on={{ scaleX: [1, 0.15, 1] }} off={{ scaleX: 1 }}><path d="M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" /></Part>
    </>
  ),
  tech: (
    <Part on={{ rotate: [0, -14, 9, 0] }} off={{ rotate: 0 }}>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </Part>
  ),
  results: <Part on={{ y: [0, 2.2, -0.6, 0], scaleY: [1, 0.9, 1.03, 1] }} off={{ y: 0, scaleY: 1 }}><path d="M4 5h16l-6 8v6l-4-2v-4z" /></Part>,
  sales: (
    <Part on={{ scaleX: [1, 0.05, 1] }} off={{ scaleX: 1 }}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M14.5 9.6c0-1-1.1-1.6-2.5-1.6s-2.5.6-2.5 1.6 1.1 1.4 2.5 1.7 2.5.7 2.5 1.7-1.1 1.6-2.5 1.6-2.5-.6-2.5-1.6" />
    </Part>
  ),
  speed: (
    <>
      <path d="M4 16a8 8 0 1 1 16 0" />
      <Part on={{ rotate: [-50, 25, 0] }} off={{ rotate: 0 }} style={pivot(12, 16)}><path d="M12 16l4-5" /></Part>
    </>
  ),
  mentions: <Part on={{ y: [0, -2, 0], rotate: [0, -4, 0] }} off={{ y: 0, rotate: 0 }}><path d="M4 5h16v11H9l-5 4z" /></Part>,
  links: <Part on={{ rotate: [0, -14, 10, 0] }} off={{ rotate: 0 }}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Part>,
  ai: (
    <>
      <Part on={{ scale: [1, 0.78, 1.12, 1], rotate: [0, 0, 12, 0] }} off={{ scale: 1, rotate: 0 }}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></Part>
      <Part on={{ scale: [1, 0.3, 1.25, 1], opacity: [1, 0.3, 1] }} off={{ scale: 1, opacity: 1 }}><path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z" /></Part>
    </>
  ),
  answers: <Part on={{ y: [0, -2.5, 0.5, 0] }} off={{ y: 0 }}><path d="M12 3a7 7 0 0 0-7 7v10l2.5-1.8 2.2 1.8 2.3-1.8 2.3 1.8 2.2-1.8 2.5 1.8V10a7 7 0 0 0-7-7z" /></Part>,
}

/** A section's icon in the grid; it plays its motion while `active` (the tile is hovered or focused). */
export function TileIcon({ name, active }: { name: string; active: boolean }) {
  const still = useReducedMotion()
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <motion.g initial={false} animate={active && !still ? 'on' : 'off'}>
        {ICONS[name] ?? ICONS.pages}
      </motion.g>
    </svg>
  )
}
