// The shell every kit card sits in: a rounded surface that lifts a little on
// hover, a title row with an optional ↗ in the corner. As a button the whole
// card is the target (a site card); the corner is then only a mark. The icon
// tile and the status make the top line every card shares.
import type { CSSProperties, KeyboardEventHandler, ReactNode } from 'react'
import { kitWords } from './copy'
import './card.css'

type Variant = 'plain' | 'accent' | 'warn' | 'dashed'

export type CardProps = {
  /** In the tile before the title. */
  icon?: ReactNode
  /** Tone of the icon tile: the one place a card's state shows in colour. */
  tone?: 'good' | 'warn' | 'bad'
  /** A quiet word on the right of the top line ("No one online", "today"). */
  status?: ReactNode
  /** A link in the corner instead of a button. */
  href?: string
  /** Drawn to the card's bottom and side edges. */
  chart?: ReactNode
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
  /** data-* hooks on the card (a spec or a stylesheet finds the card by them). */
  data?: Record<`data-${string}`, string>
  children?: ReactNode
}

function Corner({ onOpen, openLabel, mark, href }: { onOpen?: () => void; openLabel?: string; mark: boolean; href?: string }) {
  if (href)
    return (
      <a className="kit-go" href={href} aria-label={openLabel ?? kitWords.open}>
        {kitWords.corner}
      </a>
    )
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

export function Card({ icon, tone, status, href, chart, title, aside, onOpen, openLabel, variant = 'plain', press, stretch, onKeyDown, className = '', style, label, data, children }: CardProps) {
  const stretched = !!stretch && !!onOpen && !press
  const cls = `kit-card ${variant}${press ? ' press' : ''}${stretched ? ' stretch' : ''} ${className}`.trim()
  const head = (title !== undefined || aside || status || onOpen || href) && (
    <span className="kit-head">
      {icon && (
        <span className={`kit-tile ${tone ?? ''}`} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="kit-title">
        {stretched ? (
          <button type="button" className="kit-stretch" aria-label={openLabel ?? kitWords.open} onClick={onOpen}>
            {title}
          </button>
        ) : (
          title
        )}
      </span>
      {status && (
        <span className="kit-status" title={typeof status === 'string' ? status : undefined}>
          {status}
        </span>
      )}
      {aside}
      <Corner onOpen={onOpen} openLabel={openLabel} mark={(!!press || stretched) && !!onOpen} href={href} />
    </span>
  )
  if (press)
    return (
      <button type="button" className={cls} style={style} aria-label={label} onClick={press} onKeyDown={onKeyDown}>
        {head}
        {children}
        {chart && <span className="kit-chart">{chart}</span>}
      </button>
    )
  return (
    <section className={cls} style={style} aria-label={label} {...data}>
      {head}
      {children}
      {chart && <div className="kit-chart">{chart}</div>}
    </section>
  )
}
