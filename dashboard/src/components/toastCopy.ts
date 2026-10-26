// Every word of the toasts (Toast.tsx).
import { defineCopy } from '../i18n'

export const toastCopy = defineCopy('toast', {
  dismiss: 'Dismiss',
  /** Two lines: what is shown, then the small status. */
  offline: (at: string) => `Offline. Showing data from ${at}.\nReconnecting…`,
})
