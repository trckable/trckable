// What a row of the Locations card is called: a country with its flag, a
// language by its name. Part of the same lazy chunk as the card.
import { tag } from '../../i18n'
import { countryName, flag } from '../../lib/format'

let names: Intl.DisplayNames | null | undefined

/** "German" for "de"; the code itself when the browser does not know it. */
export function languageName(code: string): string {
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([tag ?? 'en'], { type: 'language' })
    } catch {
      names = null
    }
  }
  try {
    return names?.of(code) || code
  } catch {
    return code
  }
}

export function placeLabel(dim: string, value: string): string {
  if (dim === 'country') return `${flag(value)} ${countryName(value)}`
  if (dim === 'language') return value ? languageName(value) : 'Unknown'
  return value || 'Unknown'
}

export function placeTitle(dim: string, value: string): string {
  if (dim === 'country') return countryName(value)
  return value
}
