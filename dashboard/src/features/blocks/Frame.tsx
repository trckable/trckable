import type { ReactNode } from 'react'
import { copy } from './copy'
import type { Period } from './types'
import './blocks.css'

/** A paths inside the dashboard only: a link from an answer never leaves it. */
export const insidePath = (p: string | undefined): p is string => !!p && /^\/(?!\/)/.test(p)

/** The frame every block shares: its title and period above and the drawing. The whole card opens the same thing in the dashboard (its title is the link, stretched over it): the answer's one "Open in Explore" button is not repeated on each card. */
export function Frame({ title, period, explore, children }: { title: string; period?: Period; explore?: string; children: ReactNode }) {
  return (
    <figure className="blk">
      <figcaption>
        {insidePath(explore) ? (
          <a className="blk-link" href={explore} title={copy.explore}>
            <b>{title}</b>
          </a>
        ) : (
          <b>{title}</b>
        )}
        {period && <span>{period.label}</span>}
      </figcaption>
      {children}
    </figure>
  )
}
