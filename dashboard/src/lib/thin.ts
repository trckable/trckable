// When a number is too thin to say anything about. One place for the three
// thresholds every view shares (Story, Explore, Highlights), so they never
// disagree. Pure: thin.test.ts.

/** Fewer visits than this and a rate or an average (bounce rate, session time) says nothing yet: a dash, not 100% or 0s. */
export const MIN_SESSIONS = 20
/** An earlier period with fewer visitors than this is no base for a percentage change. */
export const MIN_BASE = 20
/** A change over this many times the earlier figure is shown as "more than 10x", never as 141300%. */
export const MAX_TIMES = 10

/** Whether a period has too few visits for its rates and averages to mean anything. */
export const tooFew = (sessions: number) => sessions < MIN_SESSIONS

/** Whether the earlier period is big enough to measure a change against. */
export const baseEnough = (visitorsBefore: number | undefined) => (visitorsBefore ?? 0) >= MIN_BASE

/** Whether now is more than MAX_TIMES the earlier figure. */
export const overCap = (now: number, before: number) => before > 0 && now / before > MAX_TIMES
