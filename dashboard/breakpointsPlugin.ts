// The build's half of src/kit/breakpoints.ts: a PostCSS step that turns a width token in a media or container query,
// `@media (--sm-up)`, into its numbers, and `@bp-vars;` (once, in src/kit/breakpoints.css) into the custom properties
// every step sets (--chart-h, --fit-min). Nothing else in the CSS writes a width by hand.
import { BP, CHART_H, FIT_MIN, PANE, QUERY, STEPS, type Step } from './src/kit/breakpoints'

// PostCSS's own node types are not importable from here, so these are the parts of them this file uses.
type Node = {
  name: string
  params: string
  error: (m: string) => Error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replaceWith: (...nodes: any[]) => unknown
  source?: { input: { file?: string } }
}
type Helpers = { postcss: { parse: (css: string, o: { from?: string }) => { nodes: unknown[] } } }

const clamp = (s: Step) => `clamp(${CHART_H[s].min}px, ${CHART_H[s].vw}vw, ${CHART_H[s].max}px)`

function vars(): string {
  const root = STEPS.map((s) => `--bp-${s}: ${BP[s]}px;`).join(' ')
  const per = STEPS.map((s) => `@media ${QUERY[s]} { :root { --chart-h: ${clamp(s)}; --fit-min: ${FIT_MIN[s]}px; } }`).join('\n')
  return `:root { ${root} }\n${per}`
}

export const breakpointsPlugin = {
  postcssPlugin: 'trckable-breakpoints',
  AtRule: {
    media: resolve,
    container: resolve,
    'bp-vars': (node: Node, { postcss }: Helpers) => {
      node.replaceWith(postcss.parse(vars(), { from: node.source?.input.file }).nodes)
    },
  },
}

function resolve(node: Node) {
  if (!node.params.includes('(--')) return
  node.params = node.params.replace(/\(--([a-z0-9-]+)\)/g, (_m, name: string) => {
    const q = (QUERY as Record<string, string>)[name] ?? PANE[name]
    if (!q) throw node.error(`unknown width token --${name}; the steps are in src/kit/breakpoints.ts`)
    return q
  })
  if (node.params.includes('(--')) throw node.error('a width token was left unresolved')
}
