// The picker's side: what is chosen, and choosing. The words load once, before
// the first screen (index.ts), so a new choice starts the page again.
import { KEY } from './lang'

/** 'auto' (follow the browser) or a language code. */
export const chosen = (): string => {
  try {
    return localStorage.getItem(KEY) ?? 'auto'
  } catch {
    return 'auto'
  }
}

export function chooseLang(code: string) {
  try {
    if (code === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, code)
  } catch {
    /* storage blocked: the browser's language stays */
  }
  location.reload()
}
