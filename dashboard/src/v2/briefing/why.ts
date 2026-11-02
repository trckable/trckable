// "Why?": the cause of a change (only what can be known: a post, an outage, never a guess about people), the numbers
// behind it, and what to do. The same three lines wherever a change is shown. Pure: why.test.ts.
import { copy } from './why.copy'

export interface Why {
  cause: string
  todo?: string
}

/** Why the site is not answering (or was not), in the check's own words. */
export function whyDown(o: { domain: string; cause?: string; since?: string; minutes: number; ongoing: boolean }): Why {
  return {
    cause: o.cause ? copy.downBecause(o.domain, o.cause) : copy.downUnknown(o.domain),
    todo: o.ongoing ? copy.checkServer : copy.lookBack,
  }
}
