// A failed form submit as a line under its field. A refusal of what was typed
// (400, 401, 403, 422) says what the server found wrong, unless the caller has
// better words for that status; anything else (offline, busy, slow down) is
// the same friendly line a toast would use.
import { APIError } from './api'
import { words } from './errors'

export function formWords(e: unknown, own: Partial<Record<number, string>> = {}): string {
  if (e instanceof APIError) {
    const mine = own[e.status]
    if (mine) return mine
    if ([400, 403, 422].includes(e.status) && e.message) return e.message
  }
  return words(e)
}
