// The two lists every place that edits a site needs, kept out of any one view
// so the Sites list and the Settings page cannot drift apart.

/** The list a browser gives has no UTC in it (Chrome, Firefox and Safari leave it out), and UTC is where every
 *  new site starts: without it first in the list, a site moved to another zone could never be moved back. */
export const withUtc = (list: string[]): string[] => (list.includes('UTC') ? list : ['UTC', ...list])

/** Every timezone the browser knows, UTC included, or UTC alone where it knows none. */
export const zones: string[] = (() => {
  try {
    return withUtc((Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone'))
  } catch {
    return ['UTC']
  }
})()

/** The currencies a site can report in. Revenue is converted at the payment
 *  date, so this is a display choice, never a rewrite of the money. */
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'INR', 'BRL', 'MXN', 'SGD', 'NZD', 'ZAR']

/** The picker items for a list, keeping a value the list does not know. */
export const withCurrent = (list: string[], current: string, label = (v: string) => v) =>
  (list.includes(current) ? list : [current, ...list]).map((v) => ({ id: v, label: label(v) }))
