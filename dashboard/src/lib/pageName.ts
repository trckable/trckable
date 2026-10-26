// How a page is named inside a sentence: the readable end of its path, never the whole address. "/" is Home, the query
// and the fragment are dropped, dashes stay, and a long slug is cut with an ellipsis so a line never breaks inside it.
import { defineCopy } from '../i18n'

const words = defineCopy('pageName', { home: 'Home' })

/** The longest a page's name gets in a sentence. */
export const PAGE_NAME_MAX = 36

/** The path without its address, query and fragment, decoded when it can be. */
function cleanPath(path: string): string {
  const clean = path.split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/i, '')
  try {
    return decodeURIComponent(clean)
  } catch {
    return clean
  }
}

/** The page as a short name for a sentence: a short path as it is, a long one as "…/" and the end of it cut with an ellipsis. The full path stays in the title and the label. */
export function pageName(path: string, max = PAGE_NAME_MAX): string {
  const clean = cleanPath(path)
  const trimmed = clean.replace(/\/+$/, '')
  if (!trimmed) return words.home
  if (Array.from(trimmed).length <= max) return trimmed
  const seg = trimmed.split('/').filter(Boolean).pop() ?? ''
  const room = max - 3 // "…/" in front, "…" behind
  return `…/${Array.from(seg).slice(0, room).join('')}…`
}
