// The ring's arithmetic and its show/hide rules, with no React in them.
import type { SetupItem, SetupState } from '../../lib/apiMore'

/** A full ring is drawn with this circumference (r = 14 in a 36 box, see SetupRing). */
export const CIRCUMFERENCE = 88

/** Seven days, in milliseconds: how long the check stays once everything counted is done. */
export const CHECK_FOR = 7 * 24 * 3600 * 1000

/** done/counted as a whole percent; nothing counted is 0. */
export const percent = (done: number, counted: number): number => (counted > 0 ? Math.round((Math.min(done, counted) / counted) * 100) : 0)

/** The stroke-dashoffset that leaves `done` of `counted` drawn. */
export const offset = (done: number, counted: number): number => CIRCUMFERENCE - (CIRCUMFERENCE * percent(done, counted)) / 100

export interface Rows {
  /** Always counted. */
  core: SetupItem[]
  /** Counted until skipped. */
  optional: SetupItem[]
  /** Skipped steps first (they can be brought back), then the extras. */
  more: SetupItem[]
}

export function rowsOf(items: SetupItem[]): Rows {
  const live = (g: SetupItem['group']) => items.filter((i) => !i.skipped && i.group === g)
  return { core: live('core'), optional: live('optional'), more: [...items.filter((i) => i.skipped), ...live('more')] }
}

export interface Split {
  /** Counted and not done, in the server's order. */
  todo: SetupItem[]
  /** Counted and done. */
  done: SetupItem[]
  /** Skipped steps, then the extras. */
  more: SetupItem[]
}

export function splitOf(items: SetupItem[]): Split {
  const r = rowsOf(items)
  const counted = [...r.core, ...r.optional]
  return { todo: counted.filter((i) => !i.done), done: counted.filter((i) => i.done), more: r.more }
}

const PROVIDERS: Record<string, string> = { stripe: 'Stripe', paddle: 'Paddle', lemonsqueezy: 'Lemon Squeezy', polar: 'Polar', gumroad: 'Gumroad' }

/** A payment provider's id as its name; an unknown id is shown as it came. */
export const providerName = (id: string): string => PROVIDERS[id] ?? id

/** Steps left to do. */
export const left = (s: Pick<SetupState, 'done' | 'counted'>): number => Math.max(0, s.counted - s.done)

// "Hide this" is kept per account as an entry in the bell's read list: ring:hide:<site>:<steps left>:<unix time>.
const HIDE = 'ring:hide:'

export const hideId = (site: string, stepsLeft: number, at: number): string => `${HIDE}${site}:${stepsLeft}:${at}`

/**
 * Hidden by the person: their latest "Hide this" for this site counts, and holds while no more is left undone than
 * when they hid it. A step becoming undone (payments disconnected after the ring was hidden at 4/4) brings it back.
 */
export function hiddenBy(read: Iterable<string>, site: string, stepsLeft: number): boolean {
  const prefix = `${HIDE}${site}:`
  let at = -1
  let heldLeft = 0
  for (const id of read) {
    if (!id.startsWith(prefix)) continue
    const [l, t] = id.slice(prefix.length).split(':').map(Number)
    if (Number.isFinite(l) && Number.isFinite(t) && t > at) [at, heldLeft] = [t, l]
  }
  return at >= 0 && stepsLeft <= heldLeft
}

export type RingMode = 'ring' | 'check' | 'none'

/**
 * What the header shows: the ring while something is left, a check for seven days once everything counted is done
 * (`doneSince`: when this browser first saw it so), and nothing after that or once the person hid it.
 */
export function ringMode(o: { state: SetupState | null; hidden: boolean; doneSince: number | null; now: number }): RingMode {
  const s = o.state
  if (!s || s.counted === 0 || o.hidden) return 'none'
  if (!s.all_set) return 'ring'
  return o.doneSince === null || o.now - o.doneSince < CHECK_FOR ? 'check' : 'none'
}

/** The setup step behind each setup prompt. Goals, alerts and uptime have none that can be skipped: they always show. */
export const PROMPT_STEP: Record<string, string | undefined> = { rev: 'payments', search: 'search' }

/**
 * Is this prompt wanted? One answer for every card: the person chose the step and has not skipped it. A step that is
 * skipped or not chosen (`skipped`: the server's reading of both) is not wanted; a prompt with no step behind it always is.
 * While the checklist is not known yet nothing is wanted; the prompt's view asks for it as it opens (useWanted), so it
 * arrives with the page's own data and the prompt neither flashes nor moves.
 */
export function wanted(state: SetupState | null, kind: string): boolean {
  const id = PROMPT_STEP[kind]
  if (!id) return true
  const it = state?.items.find((i) => i.id === id)
  return !!it && !it.skipped
}

/** The checklist still says the install waits for its first visit. */
export const installWaiting = (state: SetupState | null): boolean => !!state && state.items.some((it) => it.id === 'verified' && !it.done)

/** A read of the checklist older than this is read again when the panel opens. */
export const STALE = 30_000

/** The checklist is read again when the first visit has landed while it still waits for one. */
export const visitMissed = (visited: boolean, state: SetupState | null): boolean => visited && installWaiting(state)

/** A read made at `readAt` is old on `now`. */
export const isStale = (readAt: number, now: number): boolean => now - readAt >= STALE
