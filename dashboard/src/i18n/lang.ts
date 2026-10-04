// Which language this page speaks. Plain values with nothing to wait for, so
// the message files themselves may import it (index.ts, which loads them, may
// not be imported by them).
export const KEY = 'trckable:lang'

/** The two-letter codes that have a message file in locales/. */
export const have = Object.keys(import.meta.glob('./locales/??.ts')).map((f) => f.slice(10, 12))

/** The language to use: the saved choice, else the browser's first language that is English or has a file. */
export const pickLang = (choice: string | null, browser: readonly string[], files: readonly string[]) =>
  [choice, ...browser.map((l) => l.slice(0, 2).toLowerCase())].find((l) => l === 'en' || (l && files.includes(l))) ?? 'en'

const saved = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
const browser = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? [navigator.language])]

export const lang = pickLang(saved(), browser, have)

/** The tag Intl formats with: undefined for English (the browser's own), else the browser's regional form of the language (de-AT) or the plain one. */
export const tag = lang === 'en' ? undefined : (browser.find((l) => l.slice(0, 2).toLowerCase() === lang) ?? lang)
