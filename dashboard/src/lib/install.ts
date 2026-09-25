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
  note?: string
  keywords?: string
}

export type Ctx = { host: string; site: string; domain: string; proxyKey: string }

const tag = ({ host, site }: Ctx) => `<script defer src="${host}/js/${site}.js"></script>`

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
    where: 'app/layout.tsx, plus one route so events go through your own domain.',
    code: ({ site, host, proxyKey }) => `npm i trckable

// app/layout.tsx
import { Analytics } from 'trckable/next'
<Analytics site="${site}" />

// app/api/e/route.ts — same-origin: past analytics blocklists, 400-day Safari visitors
export { POST } from 'trckable/next'

// .env
TRCKABLE_HOST=${host}
TRCKABLE_PROXY_KEY=${proxyKey}`,
    note: 'The most accurate install: nothing to block, and the cookie is first-party.',
    keywords: 'vercel app router proxy',
  },
  {
    id: 'react',
    name: 'React',
    group: 'Frameworks',
    where: 'Anywhere in your app tree (Vite, CRA, React Router).',
    code: ({ site, host }) => `npm i trckable

import { Analytics } from 'trckable/react'
<Analytics site="${site}" host="${host}" />`,
    note: 'The tracker is bundled into your app (about 2 KB), so there is no script file to block.',
    keywords: 'vite spa',
  },
  {
    id: 'vue',
    name: 'Vue & Nuxt',
    group: 'Frameworks',
    where: 'main.ts, or app.head in nuxt.config.',
    code: ({ site, host }) => `npm i trckable

// main.ts
import { init } from 'trckable'
init({ site: '${site}', host: '${host}' })

// or nuxt.config.ts
app: { head: { script: [{ src: '${host}/js/${site}.js', defer: true }] } }`,
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
init({ site: '${c.site}', host: '${c.host}' })`,
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
  ${tag(c)}
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
  ${tag(c)}
</head>`,
    keywords: 'react-router',
  },
  {
    id: 'gatsby',
    name: 'Gatsby',
    group: 'Frameworks',
    where: 'gatsby-ssr.js, through setHeadComponents.',
    code: ({ site, host }) => `// gatsby-ssr.js
exports.onRenderBody = ({ setHeadComponents }) =>
  setHeadComponents([
    <script key="trckable" defer src="${host}/js/${site}.js" />,
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
    code: ({ site, host }) => `// docusaurus.config.js
scripts: [{ src: '${host}/js/${site}.js', defer: true }],`,
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    group: 'CMS & shops',
    where: 'Appearance → Theme File Editor → header.php, or a header-scripts plugin (WPCode, Insert Headers and Footers).',
    code: (c) => `<?php // functions.php of your child theme
add_action('wp_head', function () { ?>
  ${tag(c)}
<?php });`,
    note: 'A plugin is safer than editing the theme: a theme update overwrites header.php.',
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
    name: 'Hono, Express, Fastify',
    group: 'Apps & servers',
    where: 'One middleware: serve the script and forward events from your own domain.',
    code: ({ host, proxyKey }) => `import { proxy } from 'trckable/server'

app.use('/api/e', proxy({ host: '${host}', key: '${proxyKey}' }))`,
    note: 'Same-origin, so nothing can block it and Safari keeps visitors 400 days.',
    keywords: 'node bun deno middleware',
  },
  {
    id: 'server',
    name: 'Server-side (any language)',
    group: 'Apps & servers',
    where: 'Send events straight to the HTTP API.',
    code: ({ host, site }) => `curl -X POST ${host}/api/e \\
  -H 'content-type: application/json' \\
  -d '{"s":"${site}","u":"https://your.site/path","e":"pageview","id":"<visitor>","pv":"<pageview>"}'`,
    note: 'For backends, queues and native apps. Node gets trckable/server with track() and identify().',
    keywords: 'api node python go php ruby laravel rails django',
  },
  {
    id: 'proxy',
    name: 'Proxy on your own domain',
    group: 'Apps & servers',
    where: 'Nginx, Caddy, Cloudflare Workers or Vercel rewrites.',
    code: ({ host, site, proxyKey }) => `# Nginx
location /t.js  { proxy_pass ${host}/js/${site}.js; }
location /api/e {
  proxy_pass ${host}/api/e;
  proxy_set_header X-Trckable-Client-IP $remote_addr;
  proxy_set_header X-Trckable-Proxy-Key ${proxyKey};
}`,
    note: 'Same-origin: no blocker list, and the visitor cookie lasts 400 days in Safari. Keep the proxy key secret.',
    keywords: 'nginx caddy cloudflare vercel rewrite first-party',
  },
  {
    id: 'crawlers',
    name: 'AI crawlers & bots',
    group: 'Apps & servers',
    where: 'One middleware on your own server — robots never run the browser script.',
    code: ({ host, site, proxyKey }) => `// Next.js — middleware.ts
import { reportCrawler } from 'trckable/server'

export function middleware(req) {
  reportCrawler({
    host: '${host}',
    site: '${site}',
    key: '${proxyKey}',
    url: req.url,
    ua: req.headers.get('user-agent'),
  })
}`,
    note: 'Turns on the AI crawlers module: who reads you to answer questions, who indexes you, and who collects training data.',
    keywords: 'gptbot chatgpt claude perplexity googlebot ai crawler robots seo',
  },
  {
    id: 'app',
    name: 'Electron, Tauri, PWA',
    group: 'Apps & servers',
    where: 'The npm package, with your app origin allowed.',
    code: ({ site, host }) => `import { init } from 'trckable'
init({ site: '${site}', host: '${host}' })`,
    note: 'Non-http origins are accepted; screens are tracked as paths.',
  },
]

export const GROUPS = ['Code', 'Frameworks', 'Site builders', 'CMS & shops', 'AI builders', 'Apps & servers'] as const
