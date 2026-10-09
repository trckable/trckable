// What the provider picker in Settings → Payments says.
import { defineCopy } from '../i18n'

export const payPickerCopy = defineCopy('payments.picker', {
  search: 'Search providers, or Apple Pay',
  mostUsed: 'Most used',
  matches: 'Matches',
  wallets: 'Apple Pay and Google Pay come through your provider.',
  none: 'No provider matches.',
  custom: 'Not listed? Use the custom connection.',
  connect: 'Connect',
  viaWebhook: 'via webhook',
  hint: (count: string) => `Search ${count} checkouts, or connect anything by webhook`,
})
