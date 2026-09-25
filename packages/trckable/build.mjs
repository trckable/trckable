// Builds the trckable npm package: one ESM file per entry, sharing a single
// runtime module (./index.js) so an app never runs two trackers, plus .d.ts
// files, and checks the weight budget (plan §2: react entry ≤ 2.5 KB gzip).
import { build } from 'esbuild'
import { execSync } from 'node:child_process'
import { chmodSync, readFileSync, rmSync } from 'node:fs'
import { gzipSize } from '../../scripts/gzip-size.mjs'

rmSync('dist', { recursive: true, force: true })

// Sibling imports stay imports (./index.js etc.), everything else is bundled.
const siblings = {
  name: 'siblings',
  setup(b) {
    b.onResolve({ filter: /^\.\/(index|react|server|next-client)$/ }, (a) =>
      a.importer.includes('/src/') ? { path: a.path + '.js', external: true } : undefined,
    )
  },
}

// The tracker's feature flags are compiled in, exactly as tracker/build.mjs
// does it for the script tag. An app that bundles the tracker cannot be given
// a different script later, so the bundled one carries what /js/t.js carries:
// goals, outbound links and checkout attribution. The optional modules are
// off, because they cost bytes in every app that does not ask for them.
//
// Leaving these undefined ships identifiers no browser can resolve, so the
// first pageview throws ReferenceError and the app records nothing at all —
// test/bundle.test.ts keeps that from happening again.
const FLAGS = {
  __GOALS__: 'true',
  __OUTBOUND__: 'true',
  __CHECKOUT__: 'true',
  __VITALS__: 'false',
  __FORMS__: 'false',
  __CONSENT__: 'false',
  __BANNER__: 'false',
}

const entries = [
  { name: 'index', client: false },
  { name: 'react', client: true, ext: 'tsx' },
  { name: 'next-client', client: true, ext: 'tsx' },
  { name: 'next', client: false },
  { name: 'server', client: false },
]

for (const e of entries) {
  await build({
    entryPoints: [`src/${e.name}.${e.ext ?? 'ts'}`],
    outfile: `dist/${e.name}.js`,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2020',
    minify: true,
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    plugins: [siblings],
    banner: e.client ? { js: '"use client";' } : undefined,
    legalComments: 'none',
    define: FLAGS,
  })
}

// The CLI (npx trckable mcp) runs on Node and ships as one self-contained file.
await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  minify: true,
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  define: FLAGS,
})
chmodSync('dist/cli.js', 0o755)

execSync('npx tsc -p tsconfig.build.json', { stdio: 'inherit' })

const gz = (f) => gzipSize(readFileSync(f))
const react = gz('dist/react.js') + gz('dist/index.js')
const BUDGET = 2560 // bytes, gzip; scripts/facts.mjs reads it from here
console.log(`trckable/react adds ${react} B gzip to an app (budget ${BUDGET}) ${react <= BUDGET ? '✓' : '✗ OVER BUDGET'}`)
for (const e of [...entries, { name: 'cli' }]) console.log(`  dist/${e.name}.js  ${gz(`dist/${e.name}.js`)} B gzip`)
if (react > BUDGET) process.exit(1)
