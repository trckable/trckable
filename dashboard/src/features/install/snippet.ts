// What each install method shows: its steps, its docs page, and the four tabs
// that come first. Pure functions, so the tests can read every snippet.
import { METHODS, type Ctx, type Method, type Step } from '../../lib/install'

/** The four most used, in this order; every other method is under More…. */
export const TABS = ['script', 'next', 'wordpress', 'react'] as const

export const methodOf = (id: string): Method => METHODS.find((m) => m.id === id) ?? METHODS[0]

/** The plain script tag, for the AI prompt and anything that needs the one line. */
export const tagFor = (ctx: Ctx) => methodOf('script').code(ctx)

/** The method's code in the order it is done. One block when there is one
 *  thing to do; numbered steps when there are several. */
export function stepsFor(m: Method, ctx: Ctx): Step[] {
  if (m.steps) return m.steps(ctx)
  return [{ title: '', code: m.code(ctx) }]
}

const DOCS = 'https://trckable.com/docs/'

// The docs page for each method: the ones with a page of their own, then a
// section of the platforms page, then the guide for their kind.
const PAGES: Record<string, string> = {
  script: 'install/script-tag/',
  next: 'install/npm/',
  react: 'install/npm/',
  vue: 'install/npm/',
  svelte: 'install/npm/',
  app: 'install/platforms/#electron-and-tauri',
  node: 'install/proxy/',
  proxy: 'install/proxy/',
  wordpress: 'install/platforms/#wordpress',
  shopify: 'install/platforms/#shopify',
  webflow: 'install/platforms/#webflow',
  framer: 'install/platforms/#framer',
  squarespace: 'install/platforms/#squarespace-and-wix',
  wix: 'install/platforms/#squarespace-and-wix',
  ghost: 'install/platforms/#ghost',
  astro: 'install/platforms/#astro-hugo-docusaurus-jekyll',
  static: 'install/platforms/#astro-hugo-docusaurus-jekyll',
  docusaurus: 'install/platforms/#astro-hugo-docusaurus-jekyll',
  gtm: 'install/platforms/#google-tag-manager',
  lovable: 'install/platforms/#lovable-bolt-v0-replit',
}

const BY_GROUP: Record<Method['group'], string> = {
  Code: 'install/script-tag/',
  Frameworks: 'install/script-tag/',
  'Site builders': 'install/platforms/#anything-not-listed',
  'CMS & shops': 'install/platforms/#anything-not-listed',
  'AI builders': 'install/platforms/#lovable-bolt-v0-replit',
  'Apps & servers': 'install/',
}

export const docsFor = (m: Method) => DOCS + (PAGES[m.id] ?? BY_GROUP[m.group])

export const PRIVACY_DOCS = DOCS + 'privacy/'
export const MIGRATE_DOCS = DOCS + 'migrate/'
