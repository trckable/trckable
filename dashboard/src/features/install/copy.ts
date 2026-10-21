// Every word the install flow shows, in one place: the dashboard's text moves
// to message files when translations come, and this is what moves. The AI
// prompt lives here too: it is text people read (and paste), not code.
import { initCall, nextComponent, type Ctx, type Method } from '../../lib/install'
import { tagFor } from './snippet'
import { defineCopy } from '../../i18n'

/** ", nor in the 3 scripts it loads", said properly for none and one. */
function scriptsRead(n: number): string {
  if (n === 0) return ''
  if (n === 1) return ', nor in the one script it loads'
  return `, nor in the ${n} scripts it loads`
}

/** One line of the comparison: what each way gives, and whether that is good (yes), a cost (meh) or gone (no). */
export type Tone = 'yes' | 'meh' | 'no'
type Row = { label: string; cookies: [string, Tone]; cookieless: [string, Tone] }

export const copy = defineCopy('install', {
  label: 'Install trckable',
  titleCard: (domain: string) => `Add trckable to ${domain}`,
  titleSettings: (domain: string) => `Install on ${domain}`,
  chipWaiting: 'Waiting for the first visit…',
  chipLive: 'Receiving visits',

  // Tabs.
  tabsLabel: 'How to install',
  more: 'More…',
  moreLabel: 'Every other way to install',
  moreSearch: 'Search WordPress, Shopify, Nginx…',
  docs: (name: string) => `${name} guide in the docs`,
  step: (n: number) => `Step ${n}`,
  copyStep: (title: string) => `Copy: ${title}`,
  copyCode: 'Copy the code',

  // Cookieless.
  cookieless: {
    label: 'Cookieless',
    onServer: 'No cookie, nothing stored. The script picks it up within an hour: nothing to re-paste.',
    onBundled: 'The code above has cookieless: true. Rebuild and deploy your app.',
    saving: 'Saving…',
    saved: (on: boolean) => (on ? 'Cookieless mode is on' : 'Cookieless mode is off'),
    failed: 'That did not save. Nothing changed: try again.',
    viewer: 'Only an owner of this site can change this.',
    dialogTitle: 'Use cookieless tracking?',
    dialogTitleOff: 'Use cookies again?',
    colCookies: 'With cookies',
    colCookieless: 'Cookieless',
    rows: [
      { label: 'Browser storage', cookies: ['cookie', 'meh'], cookieless: ['nothing', 'yes'] },
      { label: 'Returning visitors', cookies: ['recognised', 'yes'], cookieless: ['each day new', 'meh'] },
      { label: 'Revenue attribution', cookies: ['across days', 'yes'], cookieless: ['same day only', 'meh'] },
      { label: 'Journeys & new-vs-returning', cookies: ['on', 'yes'], cookieless: ['off', 'no'] },
    ] as Row[],
    switchBack: 'Switch back any time; nothing is lost.',
    docsLink: 'How cookieless mode works',
    cancel: 'Cancel',
    confirm: 'Use cookieless',
    confirmOff: 'Use cookies',
  },

  // Install with AI.
  ai: {
    title: 'Install with AI',
    button: 'Copy prompt',
    copied: 'Copied',
  },

  // What the site's homepage runs, said once above the tabs.
  runs: (domain: string, stack: string) => `${domain} runs ${stack}`,

  // The check.
  checkAgain: 'Look again',
  checking: (domain: string) => `Looking for the script on ${domain}…`,
  recheck: 'Looking again every 30 seconds while this is open.',
  limited: 'Checked many times just now: looking again in a few minutes. The first visit still shows up here the moment it lands.',
  failed: 'The check did not run. The first visit still shows up here the moment it lands.',
  found: {
    site: (where: string) => `Script found on ${where}, with this site’s id.`,
    viaScript: (script: string) => `Found in a script the page loads: ${script}`,
    none: (where: string, scripts: number) => `No trckable script on ${where}${scriptsRead(scripts)}. Add the code above to the page’s <head>, then publish.`,
    nosite: (where: string) => `trckable is on ${where}, but without this site’s id. Copy the code above again: keep data-site.`,
    other: (where: string) => `trckable is on ${where}, but with another site’s id. Copy the code above again.`,
    unreachable: (why: string) => `Could not read the homepage: ${why}.`,
  },
  waiting: (domain: string) => `Waiting for the first visit. Open ${domain} in a browser tab: this updates by itself.`,
  live: (path: string) => `Live: a visit to ${path} just arrived.`,
})

/** The add-site wizard: Your site → Install → Revenue (optional). */
export const wizard = defineCopy('install.wizard', {
  label: 'Add a site',
  steps: ['Your site', 'Kind', 'Install', 'Revenue (optional)'],
  title: ['Add a site', 'What kind of site is it?', '', 'Attribute revenue'],
  /** "Add trckable to example.com", with the logo's own word between. */
  addTo: ['Add', 'to'],
  titleLive: 'Peekaboo! It works.',
  sub: [
    'The domain to count visits on.',
    'So we can set up what matters for it. You can change it later.',
    '',
    'Optional. See which traffic brings paying customers.',
  ],
  kinds: { shop: 'Shop', saas: 'SaaS', content: 'Blog', other: 'Other' },
  kindReading: 'Reading your homepage…',
  kindLooks: (name: string) => `Looks like: ${name}`,
  kindChosen: 'Your choice',
  kindNone: 'We couldn’t tell. Pick one, or skip.',
  kindSkip: 'Skip',
  kindNext: 'Continue',
  domain: 'Domain',
  domainHelp: 'Paste a full address if you like.',
  countPre: 'We’ll count',
  countPost: 'and www/subdomains',
  space: 'Use a domain like example.com, with no spaces.',
  invalid: 'That doesn’t look like a domain. Use one like example.com.',
  placeholderDomain: (domain: string) => `${domain} is a placeholder. Enter your own site’s address.`,
  added: (domain: string) => `You already have ${domain}.`,
  taken: 'This domain is already added to another account. Ask its owner to invite you, or use a different domain.',
  failed: 'Couldn’t add the site. Try again in a moment.',
  needs: {
    empty: 'Enter a domain like example.com to continue.',
    space: 'Use a domain like example.com, with no spaces.',
    invalid: 'Use a domain like example.com to continue.',
    placeholder: 'Enter your own site’s address to continue.',
    added: 'You already have this site.',
  },
  goTo: 'Go to',
  prefix: 'https://',
  placeholder: 'example.com',
  cancel: 'Cancel',
  adding: 'Adding…',
  add: 'Continue',
  installed: 'I’ve installed it',
  checkingBtn: 'Checking…',
  continue: 'Continue',
  anyway: 'Continue anyway',
  later: 'Later',
  back: 'Back to install',
  revenueBody: 'Each sale is tied to the visit that brought it: revenue per page, channel and campaign. It takes a restricted key and a minute.',
  revenueConnect: 'Connect payments',
  revenueSkip: 'Skip, open the dashboard',
  open: 'Open the dashboard',
})

/** Which line the check shows, by what it found. A lookup, one case a line. */
export type Outcome = 'site' | 'none' | 'nosite' | 'other' | 'unreachable'

// The AI prompt. Complete enough that an assistant needs nothing else: the
// exact code for each stack, where it goes, and how to tell it worked.
export function aiPrompt(ctx: Ctx, method: Method): string {
  const dashboard = `${ctx.host}/${encodeURIComponent(ctx.domain)}`
  return `Add trckable analytics to this project (the site ${ctx.domain}).

The one thing to add, exactly as written (site id ${ctx.site}, server ${ctx.host}):

${tagFor(ctx)}

Where it goes, depending on the stack:
- Plain HTML, Hugo, Jekyll, Eleventy, Astro, SvelteKit, Angular, Laravel, Rails, Django: inside <head> of the layout every page uses.
- Next.js (App Router): run \`npm i trckable\`, then in app/layout.tsx add \`import { Analytics } from 'trckable/next'\` and render \`${nextComponent(ctx)}\` inside <body>. Add app/api/e/route.ts with \`export { POST } from 'trckable/next'\`, and set TRCKABLE_HOST=${ctx.host} and TRCKABLE_PROXY_KEY in .env (ask me for the key; never commit it).
- React, Vite, Vue, Svelte, any bundled app: run \`npm i trckable\`, then once at startup \`import { init } from 'trckable'\` and \`${initCall(ctx)}\`. Use this instead of the script tag, not as well.
- WordPress: add the script tag through a header-scripts plugin (WPCode) or the child theme's wp_head hook, not header.php of a theme that updates.
- I picked "${method.name}" in the dashboard: ${method.where}

Rules:
- Add it once. Search the project first for "trckable", "data-site" and "${ctx.site}"; if it is already there, fix that one instead of adding a second.
- Keep data-site="${ctx.site}" and data-domain="${ctx.domain}" exactly: the id is how visits reach this site.
- Change nothing else: no other analytics removed, no formatting of unrelated files.

When done: tell me which file you changed, deploy or run the site, open ${ctx.domain} once in a browser, and check ${dashboard} — the first visit shows up there within seconds.`
}
