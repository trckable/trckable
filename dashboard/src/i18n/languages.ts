// The languages the picker offers, each in its own name. Adding one: its file
// in locales/ (named by the two letters), and a line here (CONTRIBUTING.md).
// `partial` is for a language still being written: the check lists what is
// missing instead of failing on it.
export const LANGUAGES: readonly { code: string; name: string; partial?: boolean }[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
]
