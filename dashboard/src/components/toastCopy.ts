// Every word of the toasts (Toast.tsx).
import { defineCopy } from '../i18n'

export const toastCopy = defineCopy('toast', {
  dismiss: 'Dismiss',
  offline: (at: string) => `No internet connection. Showing data from ${at}. Reconnecting…`,
})
