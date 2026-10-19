// A visitor's drawn face, built from a few parts (face shape, skin, hair, eyes, mouth, shirt) chosen only by the
// anonymous visitor id: the same visitor is the same face in Live, the globe and the journey. Nothing about the person is
// read, so the face says nothing about who they are. No image files and no service: a handful of paths, drawn once per id.
import type { ReactElement } from 'react'
import { hueOf } from '../../lib/visitor'

const SKIN = ['#f6d5bd', '#eab98f', '#d39b6e', '#b57a4f', '#8d5a3b', '#5e3b27']
const HAIR = ['#2b2118', '#4a3322', '#7a5232', '#b8873f', '#d9c27a', '#8a8f98']
const INK = '#2b2118'

/** A small seeded sequence of numbers in 0..1, from the id. */
function seeded(id: string): () => number {
  let a = (hueOf(id) + 1) * 2654435761 + id.length
  for (let i = 0; i < id.length; i++) a = Math.imul(a ^ id.charCodeAt(i), 2246822519)
  return () => {
    a = Math.imul(a ^ (a >>> 15), 2246822507)
    a = Math.imul(a ^ (a >>> 13), 3266489909)
    return ((a ^= a >>> 16) >>> 0) / 4294967296
  }
}

const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]

const HAIRS = [
  null,
  (c: string) => <path d="M16 28c0-12 7-18 16-18s16 6 16 18c-4-6-8-9-16-9s-12 3-16 9z" fill={c} />,
  (c: string) => <path d="M15 28c0-13 7-19 17-19s17 6 17 19v18h-6V30H21v16h-6z" fill={c} />,
  (c: string) => (
    <g fill={c}>
      <circle cx="20" cy="22" r="6" />
      <circle cx="28" cy="14" r="7" />
      <circle cx="38" cy="14" r="7" />
      <circle cx="45" cy="22" r="6" />
      <circle cx="32" cy="18" r="7" />
    </g>
  ),
  (c: string) => (
    <g fill={c}>
      <path d="M16 28c0-12 7-18 16-18s16 6 16 18c-4-6-8-9-16-9s-12 3-16 9z" />
      <circle cx="32" cy="9" r="6" />
    </g>
  ),
]

const EYES = [
  <g key="a" fill={INK}>
    <circle cx="26" cy="31" r="1.9" />
    <circle cx="38" cy="31" r="1.9" />
  </g>,
  <path key="b" d="M23.5 32q2.5-3.5 5 0M35.5 32q2.5-3.5 5 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />,
  <g key="c" fill={INK}>
    <circle cx="26" cy="31" r="2.5" />
    <circle cx="38" cy="31" r="2.5" />
  </g>,
]

const MOUTHS = [
  <path key="a" d="M26 38.5q6 5 12 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />,
  <path key="b" d="M25.5 37.5h13q-1 6.5-6.500 6.500t-6.500-6.500z" fill="#fff" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />,
  <path key="c" d="M28 40h8" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />,
]

const cache = new Map<string, ReactElement>()

/** The face for an id, drawn once. Sized by its box; the box's own background shows behind it. */
export function faceOf(id: string): ReactElement {
  const hit = cache.get(id)
  if (hit) return hit
  const r = seeded(id)
  const skin = pick(r, SKIN)
  const hair = pick(r, HAIR)
  const rx = 14 + Math.floor(r() * 3)
  const style = pick(r, HAIRS)
  const shirt = `hsl(${(hueOf(id) + 150) % 360} 42% 50%)`
  const glasses = r() < 0.22
  const el = (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M6 64c0-12 10-17 26-17s26 5 26 17z" fill={shirt} />
      <rect x="27" y="38" width="10" height="12" rx="4" fill={skin} />
      {style && style === HAIRS[2] ? style(hair) : null}
      <ellipse cx="32" cy="30" rx={rx} ry="16" fill={skin} />
      {style && style !== HAIRS[2] ? style(hair) : null}
      {pick(r, EYES)}
      {pick(r, MOUTHS)}
      {glasses && (
        <g fill="none" stroke={INK} strokeWidth="1.3">
          <circle cx="26" cy="31" r="4.6" />
          <circle cx="38" cy="31" r="4.6" />
          <path d="M30.600 31h2.800" />
        </g>
      )}
    </svg>
  )
  cache.set(id, el)
  return el
}
