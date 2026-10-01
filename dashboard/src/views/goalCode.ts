// The code the Track a goal dialog shows for each way to count one. A property
// on a click goal is data-trckable-goal-<name>: the tracker reads that prefix.
export const goalCode = (host: string, site: { id: string; domain: string }): Record<'html' | 'js' | 'api', string> => ({
  html: `<button data-trckable-goal="signup">Create account</button>

<!-- with properties -->
<button data-trckable-goal="signup" data-trckable-goal-plan="pro">Go pro</button>`,
  js: `// after the thing actually succeeded
trckable('goal', 'signup', { plan: 'pro' })

// or from the npm package
import { track } from 'trckable'
track('signup', { plan: 'pro' })`,
  api: `curl -X POST ${host}/api/e \\
  -H 'content-type: application/json' \\
  -d '{"s":"${site.id}","u":"https://${site.domain}/welcome",
       "e":"goal","n":"signup","p":{"plan":"pro"},
       "id":"<visitor id from the cookie>","pv":"<pageview id>"}'`,
})
