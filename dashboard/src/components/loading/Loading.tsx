import type { CSSProperties, ReactNode } from 'react'
import '../../brand/logo.css'
import { defineCopy } from '../../i18n'
import { copy as english } from './copy'
import './Loading.css'
import { markHtml, type LoadingSize } from './markup'

// The boot page (index.html) reads the English file at build time; the app says it in the chosen language.
const copy = defineCopy('loading', english)

// The page-size loader is the app itself on its way; the rest, a part of it.
const DEFAULT: Record<LoadingSize, string> = { inline: copy.label, block: copy.label, page: copy.boot }

type Props = {
  /** inline: beside words; block: a card or panel waiting; page: the screen. */
  size?: LoadingSize
  /** What a screen reader hears; the copy file's words by default. */
  label?: string
  /** Words shown under the ghost (block and page). */
  children?: ReactNode
  /** A block's height while it waits, so nothing jumps when data lands. */
  height?: number
}

/** trckable's one loading indicator: the logo's ghost in motion (Loading.css
    has each size's choreography). A still, composed frame under reduced motion. */
export function Loading({ size = 'block', label, children, height }: Props) {
  const Tag = size === 'inline' ? 'span' : 'div'
  const style: CSSProperties | undefined = height ? { minHeight: height } : undefined
  return (
    <Tag className={`ld ld-${size}`} role="status" aria-busy="true" aria-label={label ?? DEFAULT[size]} style={style}>
      <span className="ld-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markHtml(size) }} />
      {children && <span className="ld-text">{children}</span>}
    </Tag>
  )
}
