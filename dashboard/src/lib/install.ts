// Every way to get trckable onto a site. The three first entries are the ones
// most people need; the rest exist so nobody has to guess where their builder
// hides its <head>. Details checked against each platform's own docs in
// September 2026 — where a platform needs a paid plan, it says so.
export type Method = {
  id: string
  name: string
  group: 'Code' | 'Frameworks' | 'Site builders' | 'CMS & shops' | 'AI builders' | 'Apps & servers'
  where: string // one line: where this goes
  code: (ctx: Ctx) => string
  /** The same code in the order it is done, when there is more than one
   *  thing to do (install, then initialise). */
  steps?: (ctx: Ctx) => Step[]
  /** The tracker is bundled into the app, so the server's script (which
   *  carries the site's settings) is never loaded: cookieless mode has to be
   *  written into the code, and changing it means a rebuild. */
  bundled?: boolean
  note?: string
  keywords?: string
}

export type Step = { title: string; code: string }

/** cookieless only matters to bundled installs: every other method loads
 *  /js/<site id>.js, and the server writes the site's mode into that. */
export type Ctx = { host: string; site: string; domain: string; proxyKey: string; cookieless?: boolean }

// The option as each bundled install writes it: nothing at all when off, so
// the everyday snippet stays as short as it was.
const cookieProp = (c: Ctx) => (c.cookieless ? ' cookieless' : '')
const cookieOpt = (c: Ctx) => (c.cookieless ? ', cookieless: true' : '')
export const initCall = (c: Ctx) => `init({ site: '${c.site}', host: '${c.host}'${cookieOpt(c)} })`
const joinSteps = (steps: (c: Ctx) => Step[]) => (c: Ctx) => steps(c).map((x) => x.code).join('\n\n')

/** The component each package install renders, as the snippets write it. */
export const nextComponent = (c: Ctx) => `<Analytics site="${c.site}"${cookieProp(c)} />`
const reactComponent = (c: Ctx) => `<Analytics site="${c.site}" host="${c.host}"${cookieProp(c)} />`

const nextSteps = (c: Ctx): Step[] => [
  { title: 'Install the package', code: 'npm i trckable' },
  { title: 'Add it to app/layout.tsx', code: `import { Analytics } from 'trckable/next'\n${nextComponent(c)}` },
  {
    title: 'Add one route, so events go through your own domain',
    code: `// app/api/e/route.ts — same-origin: past analytics blocklists, 400-day Safari visitors\nexport { POST } from 'trckable/next'`,
  },
  { title: 'Set two environment variables', code: `# .env\nTRCKABLE_HOST=${c.host}\nTRCKABLE_PROXY_KEY=${c.proxyKey}` },
]

const reactSteps = (c: Ctx): Step[] => [
  { title: 'Install the package', code: 'npm i trckable' },
  { title: 'Initialise it once, anywhere in your app tree', code: `import { Analytics } from 'trckable/react'\n${reactComponent(c)}` },
]

// One attribute a line, like the rest of the snippets people read: the site
// and its domain always written out (the script works without them, but a
// tag copied elsewhere keeps saying which site it counts). pad indents every
// line after the first, for snippets that nest the tag.
// src is where the script comes from: the server's /js/<site id>.js unless a
// proxy serves it from the site's own domain; api, where events go when that
// is not next to the script.
export const tag = ({ host, site, domain }: Ctx, pad = '', src = `${host}/js/${site}.js`, api = '') =>
  [
    '<script',
    '  defer',
    `  data-site="${site}"`,
    `  data-domain="${domain}"`,
    ...(api ? [`  data-api="${api}"`] : []),
    `  src="${src}">`,
    '</script>',
  ].join('\n' + pad)

// The same attributes as an object, for configs that write the tag
// themselves (nuxt.config, docusaurus.config).
const tagObject = ({ host, site, domain }: Ctx) =>
  `{ src: '${host}/js/${site}.js', defer: true, 'data-site': '${site}', 'data-domain': '${domain}' }`


export const METHODS: Method[] = [
  {
    id: 'script',
    name: 'Script tag',
    group: 'Code',
    where: 'In the <head> of every page.',
    code: tag,
    note: 'Works anywhere HTML can be edited. This file holds only the modules you turned on.',
    keywords: 'html snippet head',
  },
  {
    id: 'next',
    name: 'Next.js',
    group: 'Frameworks',
    where: 'Edit app/layout.tsx and add one route, so events go through your own domain.',
    code: joinSteps(nextSteps),
    steps: nextSteps,
    bundled: true,
    note: 'The most accurate install: nothing to block, and the cookie is first-party.',
    keywords: 'vercel app router proxy',
  },
  {
    id: 'landing',
    name: 'Landing page and app',
    group: 'Code',
    where: 'The tag on the landing page, trckable/next in the app on a subdomain.',
    code: (c) => `<!-- landing page, in <head> -->
${tag(c)}

` + joinSteps(nextSteps)(c),
    bundled: true,
    note: 'data-domain shares the cookie with the app: one visitor, one journey, sales included.',
    keywords: 'subdomain saas marketing cross-domain',
  },
  {
    id: 'react',
    name: 'npm / React',
    group: 'Frameworks',
    where: 'Anywhere in your app tree (Vite, CRA, React Router).',
    code: joinSteps(reactSteps),
    steps: reactSteps,
    bundled: true,
    note: 'The tracker is bundled into your app (about 2 KB), so there is no script file to block.',
    keywords: 'vite spa',
  },
  {
    id: 'vue',
    name: 'Vue & Nuxt',
    group: 'Frameworks',
    where: 'main.ts, or app.head in nuxt.config.',
    code: (c) => `npm i trckable

// main.ts
import { init } from 'trckable'
${initCall(c)}

// or nuxt.config.ts
app: { head: { script: [${tagObject(c)}] } }`,
    bundled: true,
    keywords: 'nuxt vue3',
  },
  {
    id: 'svelte',
    name: 'Svelte & SvelteKit',
    group: 'Frameworks',
    where: 'src/app.html (SvelteKit) or your root component.',
    code: (c) => `<!-- src/app.html, inside <head> -->
${tag(c)}

<!-- or, bundled: -->
import { init } from 'trckable'
${initCall(c)}`,
    bundled: true,
    keywords: 'sveltekit',
  },
  {
    id: 'astro',
    name: 'Astro',
    group: 'Frameworks',
    where: 'Your base layout, inside <head>.',
    code: (c) => `---
// src/layouts/Base.astro
---
<head>
  ${tag(c, '  ')}
</head>`,
    keywords: 'starlight static',
  },
  {
    id: 'remix',
    name: 'Remix / React Router',
    group: 'Frameworks',
    where: 'root.tsx, in the <head> of the document.',
    code: (c) => `// app/root.tsx
<head>
  <Meta />
  <Links />
  ${tag(c, '  ')}
</head>`,
    keywords: 'react-router',
  },
  {
    id: 'gatsby',
    name: 'Gatsby',
    group: 'Frameworks',
    where: 'gatsby-ssr.js, through setHeadComponents.',
    code: ({ site, host, domain }) => `// gatsby-ssr.js
exports.onRenderBody = ({ setHeadComponents }) =>
  setHeadComponents([
    <script key="trckable" defer data-site="${site}" data-domain="${domain}" src="${host}/js/${site}.js" />,
  ])`,
  },
  {
    id: 'angular',
    name: 'Angular',
    group: 'Frameworks',
    where: 'src/index.html, inside <head>.',
    code: tag,
  },
  {
    id: 'static',
    name: 'Hugo, Jekyll, Eleventy',
    group: 'Frameworks',
    where: 'Your layout partial for <head> (layouts/partials/head.html, _includes/head.html).',
    code: tag,
    keywords: 'static site generator 11ty',
  },
  {
    id: 'docusaurus',
    name: 'Docusaurus',
    group: 'Frameworks',
    where: 'docusaurus.config.js, in scripts.',
    code: (c) => `// docusaurus.config.js
scripts: [${tagObject(c)}],`,
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    group: 'CMS & shops',
    where: "Easiest: a header-scripts plugin (WPCode, Insert Headers and Footers). Or paste this into your child theme's functions.php.",
    code: (c) => `<?php // functions.php of your child theme
add_action('wp_head', function () { ?>
  ${tag(c, '  ')}
<?php });`,
    note: 'A plugin or a child theme is safer than editing the theme itself: a theme update overwrites its files.',
    keywords: 'wp woocommerce plugin',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    group: 'CMS & shops',
    where: 'Online Store → Themes → Edit code → layout/theme.liquid, just before </head>.',
    code: tag,
    note:
      'theme.liquid covers the storefront only. Checkout runs on Shopify’s own pages: add the same script as a custom pixel under Settings → Customer events. checkout.liquid and Additional scripts stop firing on 26 August 2026.',
    keywords: 'liquid ecommerce checkout pixel',
  },
  {
    id: 'ghost',
    name: 'Ghost',
    group: 'CMS & shops',
    where: 'Settings → Code injection → Site header.',
    code: tag,
  },
  {
    id: 'webflow',
    name: 'Webflow',
    group: 'Site builders',
    where: 'Site settings → Custom code → Head code, then publish.',
    code: tag,
    note: 'Custom code needs a paid site plan.',
  },
  {
    id: 'framer',
    name: 'Framer',
    group: 'Site builders',
    where: 'Site settings → General → Custom code → Start of <head> tag.',
    code: tag,
    note: 'Custom code needs a paid site plan.',
  },
  {
    id: 'squarespace',
    name: 'Squarespace',
    group: 'Site builders',
    where: 'Settings → Advanced → Code injection → Header.',
    code: tag,
    note: 'Code injection needs a Core plan or higher (legacy Business/Commerce also works).',
  },
  {
    id: 'wix',
    name: 'Wix',
    group: 'Site builders',
    where: 'Settings → Advanced → Custom code → Add code, on All pages, loaded in the Head.',
    code: tag,
    note: 'Site-wide custom code needs a paid Wix plan.',
  },
  {
    id: 'carrd',
    name: 'Carrd',
    group: 'Site builders',
    where: 'Site settings → Code → Head.',
    code: tag,
    note: 'Needs a Carrd Pro plan.',
  },
  {
    id: 'bubble',
    name: 'Bubble',
    group: 'Site builders',
    where: 'Settings → SEO / metatags → Script in the header.',
    code: tag,
  },
  {
    id: 'notion',
    name: 'Notion sites (Super, Potion)',
    group: 'Site builders',
    where: 'Your host’s custom code / head field.',
    code: tag,
    note: 'Notion’s own public pages cannot run scripts; a host like Super or Potion can.',
  },
  {
    id: 'gtm',
    name: 'Google Tag Manager',
    group: 'Site builders',
    where: 'A Custom HTML tag firing on All Pages.',
    code: tag,
    note: 'One more thing between you and your data, and tag managers are blocked more often than first-party scripts. Prefer the script tag when you can.',
    keywords: 'gtm tag manager',
  },
  {
    id: 'lovable',
    name: 'Lovable, Bolt, v0, Replit',
    group: 'AI builders',
    where: 'index.html, inside <head> — ask the builder to add it.',
    code: (c) => `Add this to index.html inside <head>:

${tag(c)}`,
    note: 'These generate a normal Vite app, so the React package works too.',
    keywords: 'ai builder vibe coding',
  },
  {
    id: 'backend',
    name: 'Laravel, Rails, Django',
    group: 'Frameworks',
    where: 'Your layout template, inside <head>.',
    code: tag,
    note: 'Blade, ERB, Twig, Jinja — anywhere the layout renders <head>.',
    keywords: 'php ruby python blade erb jinja twig symfony flask',
  },
  {
    id: 'other-js',
    name: 'Solid, Qwik, Ember, Flutter web',
    group: 'Frameworks',
    where: 'index.html (web/index.html for Flutter), inside <head>.',
    code: tag,
    keywords: 'solidjs qwik ember flutter preact lit stencil',
  },
  {
    id: 'drupal',
    name: 'Drupal',
    group: 'CMS & shops',
    where: "Your theme's html.html.twig, before </head>, or a header-scripts module.",
    code: tag,
    keywords: 'twig cms',
  },
  {
    id: 'joomla',
    name: 'Joomla',
    group: 'CMS & shops',
    where: "Your template's index.php, before </head>.",
    code: tag,
  },
  {
    id: 'magento',
    name: 'Magento 2',
    group: 'CMS & shops',
    where: 'Content → Design → Configuration → edit your store view → HTML Head → Scripts and Style Sheets.',
    code: tag,
    note: 'Pick Global to cover every store view.',
    keywords: 'adobe commerce',
  },
  {
    id: 'prestashop',
    name: 'PrestaShop',
    group: 'CMS & shops',
    where: "Your theme's header.tpl, before </head>.",
    code: tag,
  },
  {
    id: 'bigcommerce',
    name: 'BigCommerce',
    group: 'CMS & shops',
    where: 'Storefront → Script Manager → Create a script, placed in the Head on all pages.',
    code: tag,
    keywords: 'ecommerce',
  },
  {
    id: 'hubspot',
    name: 'HubSpot CMS',
    group: 'Site builders',
    where: 'Settings → Website → Pages → Site header HTML.',
    code: tag,
  },
  {
    id: 'blogger',
    name: 'Blogger',
    group: 'Site builders',
    where: 'Theme → Edit HTML, before </head>.',
    code: tag,
  },
  {
    id: 'weebly',
    name: 'Weebly / Square Online',
    group: 'Site builders',
    where: 'Settings → SEO → Header code.',
    code: tag,
  },
  {
    id: 'softr',
    name: 'Softr',
    group: 'Site builders',
    where: 'Settings → Custom code → Header.',
    code: tag,
  },
  {
    id: 'discourse',
    name: 'Discourse',
    group: 'CMS & shops',
    where: 'Admin → Customize → Themes → Edit CSS/HTML → </head>.',
    code: tag,
    keywords: 'forum community',
  },
  {
    id: 'node',
    name: 'Hono, Bun, Deno, Workers',
    group: 'Apps & servers',
    where: 'One route on your own domain that forwards events, and the tag sending to it.',
    code: (c) => `// the route: any handler that takes a Request
import { proxy } from 'trckable/server'

const forward = proxy({ host: '${c.host}', proxyKey: process.env.TRCKABLE_PROXY_KEY })
app.post('/api/e', (c) => forward(c.req.raw))

# .env
TRCKABLE_PROXY_KEY=${c.proxyKey}

<!-- every page, in <head> -->
${tag(c, '', undefined, '/api/e')}`,
    note: 'Same-origin, so nothing can block it and Safari keeps visitors 400 days. Express and Fastify: turn the request into a Request first (@hono/node-server does).',
    keywords: 'node bun deno cloudflare middleware express fastify',
  },
  {
    id: 'server',
    name: 'Server-side (any language)',
    group: 'Apps & servers',
    where: 'Send events straight to the HTTP API.',
    code: ({ host, site, domain }) => `curl -X POST ${host}/api/e \\
  -H 'content-type: application/json' \\
  -H "user-agent: <the visitor's browser user agent>" \\
  -d '{"s":"${site}","k":"pv","u":"https://${domain}/pricing"}'`,
    note: 'For backends, queues and native apps. Pass the visitor’s own user agent: requests that name no browser (curl, Go, Python, Node fetch) are counted as bots and dropped.',
    keywords: 'api node python go php ruby laravel rails django',
  },
  {
    id: 'proxy',
    name: 'Proxy on your own domain',
    group: 'Apps & servers',
    where: 'Nginx, Caddy, Cloudflare Workers or Vercel rewrites.',
    code: (c) => `# Nginx
location /t.js {
  proxy_pass ${c.host}/js/${c.site}.js;
  proxy_ssl_server_name on;
}
location /api/e {
  proxy_pass ${c.host}/api/e;
  proxy_ssl_server_name on;
  proxy_set_header X-Trckable-Client-IP $remote_addr;
  proxy_set_header X-Trckable-Proxy-Key ${c.proxyKey};
}

<!-- every page, in <head>: the script and its events from your domain -->
${tag(c, '', '/t.js')}`,
    note: 'Same-origin: no blocker list, and the visitor cookie lasts 400 days in Safari. Keep the proxy key secret.',
    keywords: 'nginx caddy cloudflare vercel rewrite first-party',
  },
  {
    id: 'crawlers',
    name: 'AI assistants & crawlers',
    group: 'Apps & servers',
    where: 'One middleware on your own server — robots never run the browser script.',
    code: ({ host, site }) => `// Next.js — middleware.ts
import { reportCrawler } from 'trckable/server'

export function middleware(req) {
  reportCrawler({
    host: '${host}',
    site: '${site}',
    key: process.env.TRCKABLE_PROXY_KEY,
    url: req.url,
    ua: req.headers.get('user-agent'),
  })
}`,
    note: 'Turn the AI crawlers module on first (Settings → Modules), or nothing is recorded: then it shows who reads you to answer questions, who indexes you, and who collects training data. It needs TRCKABLE_PROXY_KEY on the server.',
    keywords: 'gptbot chatgpt claude perplexity googlebot ai crawler robots seo',
  },
  {
    id: 'app',
    name: 'Electron, Tauri, PWA',
    group: 'Apps & servers',
    where: 'The npm package, in an app served from your site’s domain.',
    code: (c) => `import { init } from 'trckable'
${initCall(c)}`,
    bundled: true,
    note: 'Screens are tracked as paths. Only pages on your site’s domain (or a subdomain) count: an Electron or Tauri window loading file:// or localhost is not, so send those screens from your backend with the HTTP API (Server-side).',
  },
]

export const GROUPS = ['Code', 'Frameworks', 'Site builders', 'CMS & shops', 'AI builders', 'Apps & servers'] as const
