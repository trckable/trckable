// The languages the picker offers, each in its own name. Adding one: its file
// in locales/ (named by the two letters), and a line here (CONTRIBUTING.md).
// `partial` is for a language still being written: the check lists what is
// missing instead of failing on it.
// Partial while the walkthrough screens (src/v2: header, Live, Briefing) have no translations yet: they show in English.
export const LANGUAGES: readonly { code: string; name: string; partial?: boolean }[] = [
  { code: 'en', name: 'English' },
  { code: 'de', partial: true, name: 'Deutsch' },
  { code: 'fr', partial: true, name: 'Français' },
  { code: 'es', partial: true, name: 'Español' },
  { code: 'it', partial: true, name: 'Italiano' },
  { code: 'nl', partial: true, name: 'Nederlands' },
]
