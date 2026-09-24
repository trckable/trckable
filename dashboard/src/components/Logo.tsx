import { ghostSvg, logoFont, logoInner } from '../brand/logo'
import '../brand/logo.css'

/** The logo: the ghost and the name, whose missing a pops in on hover. The
    markup and CSS live in src/brand, shared with trckable.com and the docs. */
export function Wordmark({ height = 28 }: { height?: number }) {
  return (
    <span
      className="tkb-logo"
      role="img"
      aria-label="trckable"
      style={{ fontSize: logoFont(height) }}
      dangerouslySetInnerHTML={{ __html: logoInner(height) }}
    />
  )
}

/** The ghost alone, for loading and empty states; `peek` bobs it while
    something is on its way. */
export function Ghost({ size = 64, peek = false }: { size?: number; peek?: boolean }) {
  return (
    <span
      className={peek ? 'ghost peek' : 'ghost'}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ghostSvg(size) }}
    />
  )
}
