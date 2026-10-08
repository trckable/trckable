// What the connect dialog says when a provider refuses the key.
import { defineCopy } from '../i18n'

export const connectCopy = defineCopy('payments.key', {
  refused: (name: string) => `${name} didn’t accept that key. Paste the restricted key again, from the page linked below.`,
  notConnected: (name: string) => `${name} not connected`,
})
