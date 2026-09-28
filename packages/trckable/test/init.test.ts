// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { apply, diff, plan, type InitOptions } from '../src/init'

/** A project that lives in memory, so the tests never touch a disk. */
function project(files: Record<string, string>): InitOptions & { files: Record<string, string> } {
  const o = {
    host: 'https://stats.example.com',
    site: 'tkb_1',
    files,
    read: async (p: string) => files[p.replace(/^\.\//, '')] ?? null,
    exists: async (p: string) => {
      const key = p.replace(/^\.\//, '')
      return key in files || Object.keys(files).some((f) => f.startsWith(key + '/'))
    },
    save: async (p: string, body: string) => {
      files[p.replace(/^\.\//, '')] = body
    },
  }
  return o
}

describe('init', () => {
  it('wires a Next.js app through its own domain', async () => {
    const o = project({
      'package.json': JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0' } }),
      'app/layout.tsx': `import './globals.css'\n\nexport default function Layout({ children }) {\n  return (\n    <html>\n      <body>\n        {children}\n      </body>\n    </html>\n  )\n}\n`,
    })
    const p = await plan(o)
    expect(p.framework).toBe('Next.js')

    const layout = p.changes.find((c) => c.path === 'app/layout.tsx')!
    expect(layout.action).toBe('edit')
    expect(layout.body).toContain("import { Analytics } from 'trckable/next'")
    expect(layout.body).toContain('<Analytics site="tkb_1" />')
    // The component renders inside <body>, not after it.
    expect(layout.body!.indexOf('<Analytics')).toBeLessThan(layout.body!.indexOf('</body>'))

    const route = p.changes.find((c) => c.path === 'app/api/e/route.ts')!
    expect(route.action).toBe('create')
    expect(route.body).toContain("export { POST } from 'trckable/next'")

    // The proxy key is never written into a file for us.
    expect(p.changes.find((c) => c.path === '.env.local')!.action).toBe('manual')

    const written = await apply(o, p)
    expect(written).toContain('app/layout.tsx')
    expect(o.files['app/layout.tsx']).toContain('<Analytics site="tkb_1" />')
  })

  it('adds the snippet to an HTML head, once', async () => {
    const o = project({ 'package.json': '{}', 'index.html': '<html>\n  <head>\n    <title>x</title>\n  </head>\n  <body></body>\n</html>\n' })
    const p = await plan(o)
    const change = p.changes[0]
    expect(change.action).toBe('edit')
    expect(change.body).toContain('https://stats.example.com/js/tkb_1.js')
    expect(change.body!.indexOf('<script')).toBeLessThan(change.body!.indexOf('</head>'))

    await apply(o, p)
    const again = await plan(o)
    expect(again.changes[0].action).toBe('manual') // already there: nothing to do
  })

  it('never invents a file for a project it does not recognise', async () => {
    const o = project({})
    const p = await plan(o)
    expect(p.framework).toBe('unknown')
    expect(p.changes.every((c) => c.action === 'manual')).toBe(true)
    expect(await apply(o, p)).toEqual([])
    expect(Object.keys(o.files)).toEqual([])
  })

  it('shows what it would change before changing it', async () => {
    const o = project({ 'package.json': '{}', 'index.html': '<html><head></head><body></body></html>' })
    const p = await plan(o)
    expect(diff(p.changes[0])).toContain('/js/tkb_1.js')
  })
})
