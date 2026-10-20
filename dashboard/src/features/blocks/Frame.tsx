import type { ReactNode } from 'react'
import { copy } from './copy'
import type { Period } from './types'
import './blocks.css'

/** A paths inside the dashboard only: a link from an answer never leaves it. */
export const insidePath = (p: string | undefined): p is string => !!p && /^\/(?!\/)/.test(p)

/** The frame every block shares: its title and period above, the drawing, and the secondary link to the same thing in the dashboard. */
export function Frame({ title, period, explore, children }: { title: string; period?: Period; explore?: string; children: ReactNode }) {
  return (
    <figure className="blk">
      <figcaption>
        <b>{title}</b>
        {period && <span>{period.label}</span>}
      </figcaption>
      {children}
      {insidePath(explore) && (
        <a className="blk-link" href={explore}>
          {copy.explore}
        </a>
      )}
    </figure>
  )
}
