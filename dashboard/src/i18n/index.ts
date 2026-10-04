// The dashboard's words in the chosen language (lang.ts says which). English is
// the words written in the code and costs nothing: a page in another language
// loads lazy.ts (its message file, and how it writes dates and decimals) before
// anything renders, so no screen is ever half and half. A key a file does not
// have stays English (locales.test.ts lists them). Changing the language
// reloads the page, so nothing here ever changes under a screen.
import { lang } from './lang'

export { lang, tag } from './lang'
export type Messages = Record<string, string | string[] | ((...args: never[]) => string)>

/** What a language other than English brings: the merge of its words, and dates and decimals written its way. Empty in English, where the code has its own. */
export const intl: Partial<typeof import('./lazy').default> = {}

if (lang !== 'en') {
  Object.assign(intl, await import('./lazy').then((m) => m.default, () => ({})))
  document.documentElement.lang = lang
}

/** A feature's words: the English written in the code, in the chosen language. */
export const defineCopy = <T>(ns: string, en: T): T => (intl.merge ? (intl.merge(en, ns) as T) : en)
