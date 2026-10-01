// What a failed request says to a person: a short, friendly line, never the
// server's own text. The code the server sent decides first, then the kind of
// failure (offline, signed out, refused, not there, too many, server trouble);
// anything else is "Something went wrong".
import { answerOf, type ToastAction } from '../components/toastBus'
import { APIError } from './api'
import { codeCopy, errorCopy as t } from './errorCopy'

export type Friendly = { text: string; kind: 'error' | 'warning'; action?: ToastAction }

const aborted = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

function byStatus(status: number): string {
  if (status === 401) return t.signIn
  if (status === 403) return t.denied
  if (status === 404) return t.missing
  if (status === 413) return t.tooLarge
  if (status === 429) return t.slow
  if (status === 502 || status === 503 || status === 504) return t.busy
  return t.unknown
}

/** The words for whatever was thrown; null for a request that was cancelled on purpose. */
export function friendly(e: unknown): Friendly | null {
  if (aborted(e)) return null
  if (!(e instanceof APIError)) return { text: e instanceof TypeError ? t.offline : t.unknown, kind: 'error' }
  const own = answerOf(e.code)
  if (own) return { kind: 'error', ...own }
  const text = codeCopy[e.code] ?? byStatus(e.status)
  return { text, kind: e.status === 429 || e.status >= 500 ? 'warning' : 'error' }
}

/** The same words as a plain string, for a place that shows a failure where it happened (a card that could not load). */
export const words = (e: unknown): string => friendly(e)?.text ?? ''
