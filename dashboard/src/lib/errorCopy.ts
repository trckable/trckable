// The words of a failure, in a few plain words each: never the server's own
// text (lib/errors.ts picks one). A code the server sent wins over the kind
// of failure; anything not listed is `unknown`.
import { defineCopy } from '../i18n'

export const errorCopy = defineCopy('error', {
  unknown: 'Something went wrong',
  retry: 'Retry',
  offline: "Can't reach the server",
  signIn: 'Please sign in again',
  denied: 'Not allowed',
  missing: 'Not found',
  tooLarge: 'That file is too large',
  slow: 'Too many tries · Wait a moment',
  busy: 'Server busy · Try again',
})

/** Words for a code the server sends, by code; more can be taught with answerCode (components/toastBus.ts). */
export const codeCopy: Record<string, string> = defineCopy('error.code', {
  not_found: 'Not found',
})
