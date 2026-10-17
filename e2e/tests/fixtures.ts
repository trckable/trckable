// The suite's `test`. Data opens on Story; almost every suite is about the
// numbers on Explore, so a dashboard address opened without a view goes to
// Explore. A suite about Story asks for ?v=story.
import { test as base, type BrowserContext, type Page } from '@playwright/test'
import { API } from '../playwright.config'

export * from '@playwright/test'

// The site server (18301) and anything not on this machine are not the dashboard.
const NOT_DATA = /^\/(settings|login|setup|api|r|s|embed|widget-embed)(\/|$)|^\/_|\.html$/

function onExplore(address: string): string {
  let url: URL
  try {
    url = new URL(address, API)
  } catch {
    return address
  }
  if (!/^(127\.0\.0\.1|localhost)$/.test(url.hostname) || url.port === '18301' || NOT_DATA.test(url.pathname) || url.pathname.split('/').length > 2 || url.searchParams.has('v')) return address
  url.searchParams.set('v', 'explore')
  return url.toString()
}

// A route handler that fetches the real answer can be overtaken by the page
// moving on or closing: the response is then disposed, or the page gone. That
// is the load being replaced, not a failure; thrown out of the handler, it
// would end the worker and take the next test with it.
const GONE = /Response has been disposed|Target page, context or browser has been closed|Target closed|Test ended|Test timeout/
type Routing = { route: (url: never, handler: (...a: never[]) => unknown, options?: never) => Promise<void> }
function tolerant(target: Routing) {
  const route = target.route.bind(target)
  target.route = (url, handler, options) =>
    route(
      url,
      (async (...a: never[]) => {
        try {
          await handler(...a)
        } catch (e) {
          if (!GONE.test(String(e))) throw e
        }
      }) as typeof handler,
      options,
    )
}

function onPage(page: Page): Page {
  tolerant(page as unknown as Routing)
  const goto = page.goto.bind(page)
  page.goto = (url, options) => goto(onExplore(url), options)
  // Charts draw in and figures count up on first sight: a test measures the page at rest.
  void page.addInitScript(() => {
    const off = () => document.documentElement.setAttribute('data-motion', 'off')
    if (document.documentElement) off()
    else document.addEventListener('DOMContentLoaded', off)
  })
  return page
}

function onContext<T extends BrowserContext>(context: T): T {
  tolerant(context as unknown as Routing)
  const newPage = context.newPage.bind(context)
  context.newPage = async () => onPage(await newPage())
  return context
}

// Every page the suite opens, the built-in `page` and the ones a test makes
// from its own context, goes through here.
export const test = base.extend({
  browser: async ({ browser }, use) => {
    const newContext = browser.newContext.bind(browser)
    browser.newContext = async (options) => onContext(await newContext(options))
    const newPage = browser.newPage.bind(browser)
    browser.newPage = async (options) => onPage(await newPage(options))
    await use(browser)
  },
})
