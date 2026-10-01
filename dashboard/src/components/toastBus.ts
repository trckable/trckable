// What a toast is told with, apart from drawing it: a message said before the
// host has loaded (it is its own chunk) waits here and is shown the moment it
// does. Everything calls toast() / settle(); nothing else is needed.
export type Kind = 'success' | 'info' | 'warning' | 'error' | 'busy'
/** 'ok' is an older name for 'success'. */
type Asked = Kind | 'ok'
export type ToastAction = { label: string; run: () => void }
export type Told = { id: number; text: string; kind: Kind; action?: ToastAction; replace?: boolean; error?: unknown; retry?: () => void }

export const EVENT = 'trckable:toast'
let seq = 0
export const nextId = () => ++seq

let drawn = false
let wake = () => {}
const waiting: Told[] = []
function send(d: Told) {
  if (drawn) {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: d }))
    return
  }
  waiting.push(d)
  wake()
}

/** The host is on screen: what was told before it is shown now, and the rest arrives as events. */
export function hostIsUp() {
  drawn = true
  waiting.splice(0).forEach(send)
}
/** Called with the first message told before the host is there (so it can be fetched at once). */
export const onWaiting = (f: () => void) => (wake = f)

const kindOf = (k: Asked): Kind => (k === 'ok' ? 'success' : k)

/** Say what just happened. Returns the id, so a busy toast can be replaced. */
export function toast(text: string, kind: Asked = 'success', action?: ToastAction): number {
  const id = nextId()
  send({ id, text, kind: kindOf(kind), action })
  return id
}

/** Replace a busy toast with its outcome (or drop it with text = ''). */
export function settle(id: number, text: string, kind: Asked = 'success', action?: ToastAction) {
  send({ id, text, kind: kindOf(kind), action, replace: true })
}

/** A failure, to be told in friendly words (lib/errors.ts turns it into them when the host draws it); with `retry`, the toast carries a Retry button. */
export function fail(error: unknown, retry?: () => void): number {
  const id = nextId()
  send({ id, text: '', kind: 'error', error, retry })
  return id
}

/** What a code of its own says: its words, and what the toast's button does. */
export type CodeAnswer = { text: string; kind?: 'error' | 'warning'; action?: ToastAction }
const answers = new Map<string, () => CodeAnswer>()

/** Teach failures a code of their own (asked when a failure happens, so an answer may depend on the page's state). */
export function answerCode(code: string, answer: () => CodeAnswer) {
  answers.set(code, answer)
}
export const answerOf = (code: string): CodeAnswer | undefined => answers.get(code)?.()
