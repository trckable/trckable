// Client half of trckable/next. Kept in its own file so the "use client"
// boundary never touches the server-side helpers in next.ts.
import { Analytics as ReactAnalytics, type AnalyticsProps } from './react'

/**
 * Put it in your root layout. By default events go to the same-origin route
 * /api/e (create it with `export { POST } from 'trckable/next'`, see next.ts),
 * which is the most accurate setup: ad blockers can't see it and Safari keeps
 * the visitor cookie for 400 days instead of 7.
 */
export function Analytics(props: AnalyticsProps): null {
  return ReactAnalytics(props)
}
