// `npx trckable init` — look at the project, say exactly what would change,
// and only then change it.
//
// It never edits checkout or payment code, never touches a file it did not
// recognise, and prints the full diff before writing anything.

export interface InitOptions {
  host: string
  site: string
  dir?: string
  /** Write the changes. Without it, init only shows them. */
  write?: boolean
  read(path: string): Promise<string | null>
  exists(path: string): Promise<boolean>
  save(path: string, body: string): Promise<void>
}

export interface Change {
  path: string
  action: 'create' | 'edit' | 'manual'
  body?: string
  /** What to show when a file has to be edited by hand. */
  hint?: string
  before?: string
}

export interface Plan {
  framework: string
  changes: Change[]
  note?: string
}

const analytics = (site: string, host: string, next: boolean) =>
  next ? `import { Analytics } from 'trckable/next'` : `import { Analytics } from 'trckable/react'`

/** Work out what this project is and what it would take to add trckable. */
export async function plan(o: InitOptions): Promise<Plan> {
  const dir = (o.dir ?? '.').replace(/\/$/, '')
  const p = (rel: string) => `${dir}/${rel}`
  const pkg = JSON.parse((await o.read(p('package.json'))) ?? '{}') as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const has = (name: string) => !!deps[name]

  // Next.js: the accurate install, because events go through the app's own
  // domain and the cookie is first-party.
  if (has('next')) {
    const layout = (await o.exists(p('app/layout.tsx'))) ? 'app/layout.tsx' : (await o.exists(p('src/app/layout.tsx'))) ? 'src/app/layout.tsx' : null
    const changes: Change[] = []
    if (layout) {
      const before = (await o.read(p(layout))) ?? ''
      changes.push({
        path: layout,
        action: /trckable/i.test(before) ? 'manual' : 'edit',
        before,
        body: /trckable/i.test(before) ? undefined : addToLayout(before, o.site),
        hint: /trckable/i.test(before) ? 'trckable is already in this file' : undefined,
      })
    } else {
      changes.push({ path: 'app/layout.tsx', action: 'manual', hint: `Add <Analytics site="${o.site}" /> to your root layout:\n  ${analytics(o.site, o.host, true)}` })
    }
    const route = (await o.exists(p('src/app'))) ? 'src/app/api/e/route.ts' : 'app/api/e/route.ts'
    if (!(await o.exists(p(route)))) {
      changes.push({ path: route, action: 'create', body: "// Events go through your own domain, so blocklists aimed at analytics\n// hosts don't catch them, and Safari keeps visitors for 400 days, not 7.\nexport { POST } from 'trckable/next'\n" })
    }
    changes.push({
      path: '.env.local',
      action: 'manual',
      hint: `TRCKABLE_HOST=${o.host}\nTRCKABLE_PROXY_KEY=<Settings → General → Proxy key>`,
    })
    return { framework: 'Next.js', changes, note: 'The proxy key lets your server forward a visitor’s country. Keep it secret.' }
  }

  // Any other React app: the tracker is bundled, so there is no file to block.
  if (has('react')) {
    const entry = ['src/main.tsx', 'src/main.jsx', 'src/index.tsx'].find(async () => true)
    for (const candidate of ['src/main.tsx', 'src/main.jsx', 'src/index.tsx']) {
      if (await o.exists(p(candidate))) {
        const before = (await o.read(p(candidate))) ?? ''
        return {
          framework: 'React',
          changes: [
            before.includes('trckable')
              ? { path: candidate, action: 'manual', hint: 'trckable is already in this file' }
              : { path: candidate, action: 'manual', hint: `Render <Analytics site="${o.site}" host="${o.host}" /> once, near the root:\n  ${analytics(o.site, o.host, false)}` },
          ],
        }
      }
    }
    void entry
    return { framework: 'React', changes: [{ path: 'your root component', action: 'manual', hint: `${analytics(o.site, o.host, false)}\n<Analytics site="${o.site}" host="${o.host}" />` }] }
  }

  // Everything else gets the snippet and the place to put it.
  const html = ['index.html', 'public/index.html', 'src/app.html'].find(() => true)
  for (const candidate of ['index.html', 'src/app.html', 'public/index.html']) {
    if (await o.exists(p(candidate))) {
      const before = (await o.read(p(candidate))) ?? ''
      // "Already installed" means this site's script, this host, or the
      // package — not the word "trckable", which a host may not contain.
      if (before.includes(`/js/${o.site}.js`) || before.includes(o.host) || /trckable/i.test(before)) {
        return { framework: 'HTML', changes: [{ path: candidate, action: 'manual', hint: 'trckable is already in this file' }] }
      }
      return {
        framework: has('@sveltejs/kit') ? 'SvelteKit' : has('astro') ? 'Astro' : has('nuxt') ? 'Nuxt' : 'HTML',
        changes: [{ path: candidate, action: 'edit', before, body: addToHead(before, o.site, o.host) }],
      }
    }
  }
  void html
  return {
    framework: 'unknown',
    changes: [{ path: 'the <head> of every page', action: 'manual', hint: `<script defer src="${o.host}/js/${o.site}.js"></script>` }],
    note: 'Settings → Install has the exact place for forty platforms.',
  }
}

/** Put the script tag just before </head>. */
function addToHead(html: string, site: string, host: string): string {
  const tag = `    <script defer src="${host}/js/${site}.js"></script>\n`
  const i = html.toLowerCase().lastIndexOf('</head>')
  return i < 0 ? html + '\n' + tag : html.slice(0, i) + tag + html.slice(i)
}

/** Add the import and the component to a Next.js root layout. */
function addToLayout(src: string, site: string): string {
  const withImport = /^import /m.test(src) ? src.replace(/^(import .*\n)(?![\s\S]*^import )/m, `$1import { Analytics } from 'trckable/next'\n`) : `import { Analytics } from 'trckable/next'\n` + src
  // Rendered last inside <body>, so it never delays anything above it.
  return withImport.replace(/([ \t]*)<\/body>/, `$1  <Analytics site="${site}" />\n$1</body>`)
}

/** A readable diff of one change. */
export function diff(c: Change): string {
  if (c.action === 'manual') return `~ ${c.path}\n${(c.hint ?? '').replace(/^/gm, '    ')}`
  if (c.action === 'create') return `+ ${c.path}\n${(c.body ?? '').replace(/^/gm, '    ')}`
  const before = (c.before ?? '').split('\n')
  const after = (c.body ?? '').split('\n')
  const added = after.filter((l) => !before.includes(l))
  return `± ${c.path}\n${added.map((l) => '  + ' + l).join('\n')}`
}

/** Apply the changes that can be applied. Returns the paths written. */
export async function apply(o: InitOptions, p: Plan): Promise<string[]> {
  const written: string[] = []
  const dir = (o.dir ?? '.').replace(/\/$/, '')
  for (const c of p.changes) {
    if (c.action === 'manual' || !c.body) continue
    await o.save(`${dir}/${c.path}`, c.body)
    written.push(c.path)
  }
  return written
}
