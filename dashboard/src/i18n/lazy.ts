// What only a page in another language needs: its message file, and the code
// that puts those words into the English ones (index.ts loads this first, so no
// screen is ever half and half). English never downloads any of it. Message
// files import helpers.ts and intl.ts, never index.ts or this file, which wait
// for them.
import type { Messages } from './index'
import intl from './intl'
import { lang } from './lang'

const files = import.meta.glob<{ default: Messages }>('./locales/??.ts')
const load = files[`./locales/${lang}.ts`]
const messages: Messages = load ? await load().then((m) => m.default, () => ({})) : {}

/** `en` with every word the language has replaced, key by key (a key is the namespace, then the path: `header.filterNote`). */
export const merge = (en: unknown, key: string, m: Messages = messages): unknown => {
  const t = m[key]
  if (t !== undefined && typeof t === typeof en) return t
  if (typeof en !== 'object' || en === null || (Array.isArray(en) && en.every((x) => typeof x === 'string'))) return en
  const out: unknown[] | Record<string, unknown> = Array.isArray(en) ? [] : {}
  for (const k in en) (out as Record<string, unknown>)[k] = merge((en as Record<string, unknown>)[k], key + '.' + k, m)
  return out
}

export default { ...intl, merge }
