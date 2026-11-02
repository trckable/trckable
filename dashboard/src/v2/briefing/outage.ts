// Minutes down inside a period, from one list of incidents. Pure: outage.test.ts.

/** Seconds of one outage inside [from, to] (an outage still going ends at `now`): the part before the period or after it is not counted. */
export const insideSeconds = (x: { started_at: number; ended_at: number | null }, from: number, to: number, now: number): number =>
  Math.max(0, Math.min(x.ended_at ?? now, to) - Math.max(x.started_at, from))

/** Seconds the site was down inside [from, to], from one list: the one rule the headline, the score and the line under the headline all use. */
export const downSeconds = (list: { started_at: number; ended_at: number | null }[], from: number, to: number, now: number): number =>
  list.reduce((n, x) => n + insideSeconds(x, from, to, now), 0)
