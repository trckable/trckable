// The suite's `test`. Data opens on Story; almost every suite is about the
// numbers on Explore, so a dashboard address opened without a view goes to
// Explore. A suite about Story asks for ?v=story.
import { test as base } from '@playwright/test'
import { API } from '../playwright.config'

export * from '@playwright/test'

const NOT_DATA = /^\/(settings|login|setup|api|r|s|embed)(\/|$)|^\/_/

function onExplore(address: string): string {
  let url: URL
  try {
    url = new URL(address, API)
  } catch {
    return address
  }
  if (url.origin !== API || NOT_DATA.test(url.pathname) || url.pathname.split('/').length > 2 || url.searchParams.has('v')) return address
  url.searchParams.set('v', 'explore')
  return url.toString()
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    page.goto = (url, options) => goto(onExplore(url), options)
    await use(page)
  },
})
