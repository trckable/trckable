// The words of a failure, in a few plain words each: never the server's own
// text (lib/errors.ts picks one). A code the server sent wins over the kind
// of failure; anything not listed is `unknown`.
import { defineCopy } from '../i18n'

export const errorCopy = defineCopy('error', {
  unknown: 'Something went wrong',
  retry: 'Retry',
  loadFailed: 'Couldn’t load this',
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
  report_memory: 'Too much data for the server to report on at once · Pick a shorter period or add a filter',
  dodo_live_key_in_test: "Dodo Payments didn't accept this key. A live key does not work in Test mode: use a test-mode key, or switch to Live.",
  dodo_test_key_in_live: "Dodo Payments didn't accept this key. A test-mode key does not work in Live mode: use a live key, or switch to Test mode.",
  dodo_unreachable: "Couldn't reach Dodo Payments. Try again in a minute.",
})
