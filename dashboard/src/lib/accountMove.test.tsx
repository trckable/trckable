import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountCard } from './accountView'
import type { Me, Site } from './api'

const reply = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const site = (id: string, domain: string): Site => ({ id, domain, name: domain, timezone: 'UTC', currency: 'USD', proxy_key: '' })
const card = (id: string, sites: Site[], total = sites.length): AccountCard => ({ id, name: id === 'a' ? 'Ann' : id, role: 'viewer', holder: false, sites, total })

const setProperty = vi.fn()

describe('the account a tab works in', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('location', { search: '', pathname: '/', hash: '', reload: vi.fn(), assign: vi.fn() })
    vi.stubGlobal('document', { documentElement: { style: { setProperty } } })
  })
  afterEach(() => vi.unstubAllGlobals())

  const accounts = [card('a', [site('s1', 'mine.example')]), { ...card('b', [site('s2', 'bees.example')]), name: 'Bo’s team', role: 'owner' }]
  const me = (account: string, role: string, path: string): Me => {
    vi.stubGlobal('location', { search: '', pathname: path, hash: '', reload: vi.fn(), assign: vi.fn() })
    return { kind: 'user', account, role, accounts }
  }
  const headerOf = (f: ReturnType<typeof vi.fn>, n: number) => (f.mock.calls[n] as unknown as [string, RequestInit])[1].headers as Record<string, string>

  it('names no account on any call until the person is in two or more', async () => {
    const fetcher = vi.fn(() => Promise.resolve(reply(200, { sites: [] })))
    vi.stubGlobal('fetch', fetcher)
    const { api } = await import('./api')
    await api.sites()
    expect(headerOf(fetcher, 0)['X-Trckable-Account']).toBe('')
  })

  it('opens the account the server chose, names it on every call and in the header', async () => {
    const fetcher = vi.fn(() => Promise.resolve(reply(200, { sites: [] })))
    vi.stubGlobal('fetch', fetcher)
    const { api } = await import('./api')
    const { settle } = await import('./accountMove')
    const got = await settle(me('a', 'viewer', '/'), [site('s1', 'mine.example')])
    expect(got.sites).toHaveLength(1)
    expect((await import('./me')).isViewer()).toBe(true)
    expect(setProperty).toHaveBeenLastCalledWith('--account', '"Ann"')
    await api.sites()
    expect(headerOf(fetcher, 0)).toHaveProperty('X-Trckable-Account', 'a')
  })

  it('goes back to the account this tab was in, and asks for its sites', async () => {
    const fetcher = vi.fn(() => Promise.resolve(reply(200, { sites: [site('s2', 'bees.example')] })))
    vi.stubGlobal('fetch', fetcher)
    const { settle, switchAccount } = await import('./accountMove')
    await switchAccount('b', '/bees.example') // what picking a site of B does: the tab keeps it
    fetcher.mockClear()
    const { view } = await import('./accountView')
    const got = await settle(me('a', 'viewer', '/bees.example'), [site('s1', 'mine.example')])
    expect((await import('./me')).canChange()).toBe(true)
    expect(got.sites.map((s) => s.id)).toEqual(['s2'])
    expect(view.account).toBe('b')
    expect(setProperty).toHaveBeenLastCalledWith('--account', '"Bo’s team"')
    expect(headerOf(fetcher, 0)).toHaveProperty('X-Trckable-Account', 'b')
  })

  it('ignores a kept account the person is no longer in', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(reply(204, null))))
    const { settle, switchAccount } = await import('./accountMove')
    await switchAccount('acc_gone', '/')
    const { view } = await import('./accountView')
    const got = await settle(me('a', 'viewer', '/'), [site('s1', 'mine.example')])
    expect(view.account).toBe('a')
    expect(got.sites).toHaveLength(1)
  })

  it('lets a link to a site win over where the tab was', async () => {
    const fetcher = vi.fn(() => Promise.resolve(reply(200, { sites: [site('s2', 'bees.example')] })))
    vi.stubGlobal('fetch', fetcher)
    const { settle } = await import('./accountMove')
    const { view } = await import('./accountView')
    const got = await settle(me('a', 'viewer', '/bees.example'), [site('s1', 'mine.example')])
    expect(view.account).toBe('b')
    expect((await import('./me')).canChange()).toBe(true)
    expect(got.sites.map((s) => s.domain)).toEqual(['bees.example'])
  })

  it('finds the account a link’s site is in, asking for the ones that list only a few', async () => {
    const fetcher = vi.fn(() => Promise.resolve(reply(200, { sites: [site('s9', 'deep.example')] })))
    vi.stubGlobal('fetch', fetcher)
    const { accountOf } = await import('./accountMove')
    const accounts = [card('a', [site('s1', 'mine.example')]), card('b', [site('s2', 'first.example')], 9), card('c', [site('s3', 'other.example')])]
    const none = new URLSearchParams()
    expect(await accountOf(accounts, 'a', '/other.example', none)).toBe('c')
    expect(await accountOf(accounts, 'a', '/OTHER.example', none)).toBe('c')
    expect(fetcher).not.toHaveBeenCalled() // the short lists already said
    expect(await accountOf(accounts, 'a', '/deep.example', none)).toBe('b')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(await accountOf(accounts, 'a', '/elsewhere', new URLSearchParams('site=s3'))).toBe('c')
    expect(await accountOf(accounts, 'a', '/nowhere.example', none)).toBeNull()
  })
})
