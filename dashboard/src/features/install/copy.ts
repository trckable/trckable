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
  titleLive: 'Peekaboo! Your first visit just arrived.',
  liveFrom: (path: string, country?: string) => (country ? `Someone opened ${path} from ${country}.` : `Someone opened ${path}.`),
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
    label: 'Use cookieless tracking',
    hint: 'No cookie, nothing stored in the browser.',
    onServer: 'On for this site. The script picks it up by itself within an hour (browsers keep it up to an hour): nothing to re-paste.',
    offServer: 'Off. Visitors get a first-party cookie, so returning visits and journeys are counted.',
    onBundled: 'The code above has cookieless: true. Rebuild and deploy your app after changing this.',
    offBundled: 'Rebuild and deploy your app after changing this: the setting is written into the code.',
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
    body: 'One prompt for Cursor, Copilot or Claude Code: your site id, domain and server filled in, and where the code goes for your stack.',
    button: 'Copy AI prompt',
    copied: 'Prompt copied',
    preview: 'Show the prompt',
  },

  // The check.
  installed: 'OK, I’ve installed it',
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

/** The new-site card on the dashboard: one calm card, nothing behind it. */
export const waitCard = defineCopy('install.wait', {
  title: 'Waiting for the first visit',
  subScript: ['Add this to the', '<head>', (domain: string) => `of ${domain}, then open the site once.`] as const,
  subOther: (where: string) => `${where} Then open the site once.`,
  check: 'Check my site',
  prompt: 'Copy a prompt for your AI editor',
  promptCopied: 'Prompt copied',
  foot: 'Your dashboard opens here by itself the moment a visit arrives.',
  dev: ['Testing on localhost? Add', 'data-dev', 'to the script tag.'] as const,
})

/** The add-site wizard: Your site → Install → Revenue (optional). */
export const wizard = defineCopy('install.wizard', {
  label: 'Add a site',
  steps: ['Your site', 'Install', 'Revenue (optional)'],
  title: ['Add a site', '', 'Attribute revenue'],
  /** "Add trckable to example.com", with the logo's own word between. */
  addTo: ['Add', 'to'],
  titleLive: 'Peekaboo! It works.',
  sub: [
    'The domain to count visits on.',
    'Copy the code, then check it is in.',
    'Optional. See which traffic brings paying customers.',
  ],
  domain: 'Domain',
  domainHelp: 'Paste a full address if you like.',
  countPre: 'We’ll count',
  countPost: 'and www/subdomains',
  space: 'Use a domain like example.com, with no spaces.',
  invalid: 'That doesn’t look like a domain. Use one like example.com.',
  added: (domain: string) => `You already have ${domain}.`,
  failed: 'Couldn’t add the site. Try again in a moment.',
  needs: {
    empty: 'Enter a domain like example.com to continue.',
    space: 'Use a domain like example.com, with no spaces.',
    invalid: 'Use a domain like example.com to continue.',
    added: 'You already have this site.',
  },
  goTo: 'Go to',
  prefix: 'https://',
  placeholder: 'example.com',
  cancel: 'Cancel',
  adding: 'Adding…',
  add: 'Continue',
  later: 'I’ll do it later',
  next: 'Next: revenue',
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
