// Moving between the accounts a person is in: to one of their sites, or to
// the account an address names. Fetched only for a person in several accounts.
import { call, type Me, type Site } from './api'
import { view, type AccountCard } from './accountView'
import { setRole } from './me'
import { canonDomain } from './siteRoute'

const KEY = 'trckable:account'
let kept = ''

/** The account this tab was in before a reload. */
function stored(): string {
  try {
    return sessionStorage.getItem(KEY) ?? kept
  } catch {
    return kept // storage blocked: the tab still works, it is asked again after a reload
  }
}

/** A reload keeps this tab in `id`. */
function keep(id: string) {
  kept = id
  try {
    sessionStorage.setItem(KEY, id)
  } catch {
    /* storage blocked */
  }
}

/** This tab works in `id` from now on: every call names it. */
function pin(accounts: AccountCard[], id: string) {
  keep(id)
  view.account = id
  const name = accounts.find((a) => a.id === id)?.name ?? ''
  // The header names it: a CSS string, so nothing but printable text goes in.
  document.documentElement.style.setProperty('--account', JSON.stringify(name.replace(/[^\x20-\x7e\u00a0-\uffff]/g, '')))
  view.list = accounts
}

/** The sites of one of the person's accounts, whichever this tab is in. */
const sitesOf = (account: string) => call<{ sites: Site[] }>('GET', '/sites', undefined, undefined, true, account)
const remember = (account: string) => call('POST', '/me/account', { account }).catch(() => {}) // only a preference: the tab already holds it

/** Open `path` in another of the person's accounts: the tab takes it, the
 *  server remembers it for the next new tab, and the page starts over there
 *  (its sites, layout and numbers are that account's). */
export async function switchAccount(id: string, path: string) {
  keep(id)
  await remember(id)
  location.assign(path)
}

/** Whether a site in `sites` is the one the address names: its first segment
 *  (a domain), or ?site=<id>. */
function named(sites: Site[], path: string, params: URLSearchParams): boolean {
  const want = canonDomain(decodeURIComponent(path.slice(1).split('/')[0] ?? ''))
  const id = params.get('site')
  return sites.some((s) => (want !== '' && canonDomain(s.domain) === want) || (id !== null && s.id === id))
}

/** The account that has the site an address names, when this tab's account
 *  does not: a link to a site wins over where the tab was. */
export async function accountOf(accounts: AccountCard[], here: string, path: string, params: URLSearchParams): Promise<string | null> {
  const others = accounts.filter((a) => a.id !== here)
  // What /me already lists first; only an account with more sites than it
  // lists is asked for the rest.
  const listed = others.find((a) => named(a.sites as Site[], path, params))
  if (listed) return listed.id
  for (const a of others.filter((x) => x.sites.length < x.total)) {
    const all = await sitesOf(a.id).catch(() => null)
    if (all && named(all.sites, path, params)) return a.id
  }
  return null
}

/** Start-up for a person in several accounts: the account this tab was in
 *  (else the one the server opened), unless the address names a site of
 *  another. Sets the role to use there and returns the sites. */
export async function settle(me: Me, sites: Site[]): Promise<{ sites: Site[] }> {
  const accounts = me.accounts ?? []
  const opened = me.account ?? ''
  let role = me.role
  const path = location.pathname
  const params = new URLSearchParams(location.search)
  const before = stored()
  const here = accounts.some((a) => a.id === before) ? before : opened
  if (here !== opened) {
    sites = (await sitesOf(here)).sites
    role = accounts.find((a) => a.id === here)?.role
  }
  pin(accounts, here)
  const search = path !== '/' && path !== '/all' && !named(sites, path, params)
  const to = search ? await accountOf(accounts, here, path, params) : null
  if (!to) {
    setRole(role)
    return { sites }
  }
  pin(accounts, to)
  void remember(to)
  role = accounts.find((a) => a.id === to)?.role
  setRole(role)
  return call<{ sites: Site[] }>('GET', '/sites')
}
