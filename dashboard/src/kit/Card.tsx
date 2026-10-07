// The shell every kit card sits in: a rounded surface that lifts a little on
// hover, a title row with an optional ↗ in the corner. As a button the whole
// card is the target (a site card); the corner is then only a mark.
import type { CSSProperties, KeyboardEventHandler, ReactNode } from 'react'
import { kitWords } from './copy'
import './kit.css'

type Variant = 'plain' | 'accent' | 'warn' | 'hero' | 'open'

export type CardProps = {
  title?: ReactNode
  /** Beside the title, in place of the ↗ when there is no `onOpen`. */
  aside?: ReactNode
  onOpen?: () => void
  openLabel?: string
  variant?: Variant
  /** The whole card is one button. */
  press?: () => void
  /** The title is the button that opens the card, stretched over all of it; rows inside sit above it. */
  stretch?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  className?: string
  style?: CSSProperties
  label?: string
  children?: ReactNode
}

function Corner({ onOpen, openLabel, mark }: { onOpen?: () => void; openLabel?: string; mark: boolean }) {
  if (!onOpen && !mark) return null
  if (mark || !onOpen)
    return (
      <span className="kit-go" aria-hidden="true">
        {kitWords.corner}
      </span>
    )
  return (
    <button type="button" className="kit-go" aria-label={openLabel ?? kitWords.open} onClick={onOpen}>
      {kitWords.corner}
    </button>
  )
}

export function Card({ title, aside, onOpen, openLabel, variant = 'plain', press, stretch, onKeyDown, className = '', style, label, children }: CardProps) {
  const stretched = !!stretch && !!onOpen && !press
  const cls = `kit-card ${variant}${press ? ' press' : ''}${stretched ? ' stretch' : ''} ${className}`.trim()
  const head = (title !== undefined || aside || onOpen) && (
    <span className="kit-head">
      <span className="kit-title">
        {stretched ? (
          <button type="button" className="kit-stretch" aria-label={openLabel ?? kitWords.open} onClick={onOpen}>
            {title}
          </button>
        ) : (
          title
        )}
      </span>
      {aside}
      <Corner onOpen={onOpen} openLabel={openLabel} mark={(!!press || stretched) && !!onOpen} />
    </span>
  )
  if (press)
    return (
      <button type="button" className={cls} style={style} aria-label={label} onClick={press} onKeyDown={onKeyDown}>
        {head}
        {children}
      </button>
    )
  return (
    <section className={cls} style={style} aria-label={label}>
      {head}
      {children}
    </section>
  )
}
