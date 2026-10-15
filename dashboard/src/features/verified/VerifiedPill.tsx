// The seal: "Verified · Payments", the badges that work right now. On a shared page it
// is a pill; in the header it is a small seal on the site's avatar (`seal`). A click
// opens what stands behind the numbers, one row per badge. Nothing at all
// while no source works: the seal claims only what is true. Only the button is
// in the first load; the panel is a chunk of its own, asked for when the
// pointer or focus reaches the button.
import { Suspense, useCallback, useRef, useState } from 'react'
import { lazyLoad, warm } from '../../lib/lazyLoad'
import type { Verified } from '../../lib/api'
import { copy } from './copy'
import { Seal } from './Marks'
import { earned } from './model'
import './verified.css'

const Pop = lazyLoad(() => import('./Pop'))

export interface PillProps {
  verified?: Verified
  /** The site on screen; for a shared page, nothing to ask Settings about. */
  site?: { id: string; domain: string }
  /** Someone reading a shared link: their copy, no Connect, no fresh read. */
  viewer?: boolean
  /** A link that hides trckable's name also leaves out the link back. */
  brand?: boolean
  /** The small seal on the site's avatar, not the pill with words. */
  seal?: boolean
}

export function VerifiedPill({ verified, site, viewer, brand = true, seal }: PillProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const names = earned(verified).map((k) => copy.names[k]).join(', ')
  if (!names) return null
  return (
    <>
      <button
        ref={anchor}
        type="button"
        {...warm(Pop.preload)}
        className={seal ? 'vf-sealbtn' : 'vf-pill'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={copy.pillLabel(names)}
        title={copy.sealLabel(names)}
        onClick={() => setOpen((o) => !o)}
      >
        <Seal size={seal ? 12 : 14} />
        {!seal && <span className="vf-pill-text">{copy.sealLabel(names)}</span>}
      </button>
      {open && (
        <Suspense fallback={null}>
          <Pop anchor={anchor} onClose={close} verified={verified} site={site} viewer={!!viewer} brand={brand} />
        </Suspense>
      )}
    </>
  )
}
