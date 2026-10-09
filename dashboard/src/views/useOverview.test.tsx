import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteRow } from '../lib/api'
import { feedOnline, resetOnline } from '../lib/allOnline'
import { OnlineTile } from './OnlineTile'
import { summarize } from './allSitesLogic'

const row = (id: string, online: number) => ({ id, online, visitors: 0, pageviews: 0 }) as SiteRow

describe('All sites online', () => {
  beforeEach(() => {
    resetOnline()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows the sum of the rows it is given, not the switcher\'s own count', () => {
    feedOnline([row('a', 20), row('b', 9)])
    const rows = [row('a', 11), row('b', 7)]
    expect(renderToStaticMarkup(<OnlineTile count={summarize(rows).online} />)).toContain('>18<')
  })
})
